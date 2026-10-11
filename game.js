    (() => {
      'use strict';

      const canvas = document.getElementById('game');
      const THREE = window.THREE;
      const portraitQuery = window.matchMedia('(orientation: portrait)');
      const overlay = document.getElementById('overlay');
      const playButton = document.getElementById('play');
      const fullscreenButton = document.getElementById('fullscreen');
      const hallButton = document.getElementById('hall-of-fame');
      const hallPanel = document.getElementById('hall-of-fame-panel');
      const namePanel = document.getElementById('player-name-panel');
      const nameInput = document.getElementById('player-name');
      const nameError = document.getElementById('player-name-error');
      const lapDisplay = document.getElementById('lap');
      const placeDisplay = document.getElementById('place');
      const speedDisplay = document.getElementById('speed');
      const boostDisplay = document.getElementById('boost');
      const boostStatus = document.getElementById('boost-status');
      const boostCard = document.querySelector('.boost-card');
      const raceNotification = document.getElementById('race-notification');
      const TAU = Math.PI * 2;
      const TRACK_WIDTH = 260;
      const ROAD_HALF = TRACK_WIDTH / 2;
      const ROAD_SURFACE_Y = 7;
      const CAR_RIDE_HEIGHT = ROAD_SURFACE_Y - 1.8;
      const WORLD_SCALE = 3.15;
      const WORLD_LIMIT_X = 3500;
      const WORLD_LIMIT_Z = 3500;
      const TOTAL_LAPS = 3;
      const HALL_STORAGE_KEY = 'deskDashHallOfFame';
      const keys = new Set();
      const touches = new Set();
      const racers = [];
      let mode = 'menu';
      let previousTime = 0;
      let raceTime = 0;
      let cameraShake = 0;
      let renderer;
      let scene;
      let camera;
      let cameraTargetReady = false;
      const carMeshes = new Map();
      let countdownRemaining = 0;
      let pausedMode = null;
      const sparks = [];
      const smokeParticles = [];
      const softShadowTextures = new Map();
      let pendingResult = null;
      let raceNotificationTimer = 0;
      let finishDisplayTimer = 0;
      let tiltSteer = 0;
      let tiltNeutral = null;
      let tiltEnabled = false;
      let boostGlowTexture;

      const controlKeys = {
        ArrowUp: 'gas', KeyW: 'gas',
        ArrowDown: 'brake', KeyS: 'brake',
        ArrowLeft: 'left', KeyA: 'left',
        ArrowRight: 'right', KeyD: 'right',
        ShiftLeft: 'boost', ShiftRight: 'boost'
      };

      const controls = {
        gas: false, brake: false, left: false, right: false, drift: false, boost: false
      };

      const trackAnchors = [
        { x: 220, y: 104 }, { x: 265, y: 99 }, { x: 301, y: 125 },
        { x: 341, y: 157 }, { x: 382, y: 184 }, { x: 421, y: 207 },
        { x: 463, y: 231 }, { x: 502, y: 257 }, { x: 530, y: 293 },
        { x: 552, y: 331 }, { x: 578, y: 340 }, { x: 595, y: 312 },
        { x: 604, y: 275 }, { x: 616, y: 243 }, { x: 641, y: 224 },
        { x: 673, y: 221 }, { x: 702, y: 237 }, { x: 722, y: 265 },
        { x: 727, y: 301 }, { x: 719, y: 337 }, { x: 703, y: 369 },
        { x: 679, y: 397 }, { x: 649, y: 421 }, { x: 619, y: 445 },
        { x: 592, y: 472 }, { x: 570, y: 502 }, { x: 550, y: 539 },
        { x: 533, y: 584 }, { x: 511, y: 617 }, { x: 480, y: 637 },
        { x: 447, y: 635 }, { x: 421, y: 617 }, { x: 400, y: 590 },
        { x: 381, y: 564 }, { x: 359, y: 555 }, { x: 333, y: 565 },
        { x: 306, y: 581 }, { x: 277, y: 592 }, { x: 246, y: 590 },
        { x: 216, y: 579 }, { x: 187, y: 561 }, { x: 158, y: 538 },
        { x: 135, y: 509 }, { x: 121, y: 478 }, { x: 119, y: 451 },
        { x: 130, y: 428 }, { x: 151, y: 411 }, { x: 182, y: 396 },
        { x: 214, y: 380 }, { x: 245, y: 361 }, { x: 263, y: 342 },
        { x: 255, y: 326 }, { x: 231, y: 316 }, { x: 203, y: 307 },
        { x: 178, y: 292 }, { x: 157, y: 269 }, { x: 145, y: 243 },
        { x: 148, y: 222 }, { x: 163, y: 209 }, { x: 187, y: 204 },
        { x: 210, y: 197 }, { x: 225, y: 181 }, { x: 228, y: 159 },
        { x: 220, y: 135 }
      ];
      const track = [];
      const trackSegments = 42;
      for (let i = 0; i < trackAnchors.length; i++) {
        const p0 = trackAnchors[(i - 1 + trackAnchors.length) % trackAnchors.length];
        const p1 = trackAnchors[i];
        const p2 = trackAnchors[(i + 1) % trackAnchors.length];
        const p3 = trackAnchors[(i + 2) % trackAnchors.length];
        for (let step = 0; step < trackSegments; step++) {
          const t = step / trackSegments;
          const t2 = t * t;
          const t3 = t2 * t;
          const catmull = (a, b, c, d) =>
            .5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
          track.push({
            x: (catmull(p0.x, p1.x, p2.x, p3.x) - 500) * WORLD_SCALE,
            y: (catmull(p0.y, p1.y, p2.y, p3.y) - 350) * WORLD_SCALE
          });
        }
      }

      const trackDistances = [0];
      for (let i = 0; i < track.length; i++) {
        const point = track[i];
        const next = track[(i + 1) % track.length];
        trackDistances.push(trackDistances[i] + Math.hypot(next.x - point.x, next.y - point.y));
      }
      const trackLength = trackDistances[track.length];
      const START_TRACK_INDEX = 207;
      const START_PROGRESS = START_TRACK_INDEX / track.length;
      const START_TRACK_DISTANCE = trackDistances[START_TRACK_INDEX];
      const MAX_REVERSE_TRACK_DISTANCE = 110;

      function trackMiter(index) {
        const current = track[index];
        const before = track[(index - 1 + track.length) % track.length];
        const after = track[(index + 1) % track.length];
        const prevX = current.x - before.x;
        const prevZ = current.y - before.y;
        const nextX = after.x - current.x;
        const nextZ = after.y - current.y;
        const prevLength = Math.hypot(prevX, prevZ) || 1;
        const nextLength = Math.hypot(nextX, nextZ) || 1;
        const prevNX = -prevZ / prevLength;
        const prevNZ = prevX / prevLength;
        const nextNX = -nextZ / nextLength;
        const nextNZ = nextX / nextLength;
        const miterLength = Math.hypot(prevNX + nextNX, prevNZ + nextNZ) || 1;
        const x = (prevNX + nextNX) / miterLength;
        const z = (prevNZ + nextNZ) / miterLength;
        const scale = Math.min(2, 1 / Math.max(.5, x * nextNX + z * nextNZ));
        return { x, z, scale };
      }

      function trackOffsetPoint(index, distance) {
        const point = track[index];
        const miter = trackMiter(index);
        return {
          x: point.x + miter.x * distance * miter.scale,
          z: point.y + miter.z * distance * miter.scale
        };
      }

      const roadLeftBoundary = track.map((_, index) => trackOffsetPoint(index, ROAD_HALF));
      const roadRightBoundary = track.map((_, index) => trackOffsetPoint(index, -ROAD_HALF));

      function pointInTriangle(x, y, a, b, c) {
        const cross = (p1, p2) => (x - p2.x) * (p1.z - p2.z) - (p1.x - p2.x) * (y - p2.z);
        const first = cross(a, b);
        const second = cross(b, c);
        const third = cross(c, a);
        const hasNegative = first < 0 || second < 0 || third < 0;
        const hasPositive = first > 0 || second > 0 || third > 0;
        return !(hasNegative && hasPositive);
      }

      function closestPointOnSegment(x, y, start, end) {
        const dx = end.x - start.x;
        const dy = end.z - start.z;
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
          ((x - start.x) * dx + (y - start.z) * dy) / lengthSquared
        ));
        return { x: start.x + dx * t, y: start.z + dy * t, t };
      }

      function pointOnRoadSegment(x, y, index) {
        const next = (index + 1) % track.length;
        const leftStart = roadLeftBoundary[index];
        const leftEnd = roadLeftBoundary[next];
        const rightStart = roadRightBoundary[index];
        const rightEnd = roadRightBoundary[next];
        return pointInTriangle(x, y, leftStart, leftEnd, rightStart) ||
          pointInTriangle(x, y, leftEnd, rightEnd, rightStart);
      }

      function nearestRoadBoundary(x, y, preferredIndex) {
        for (let offset = -80; offset <= 80; offset++) {
          const index = (preferredIndex + offset + track.length) % track.length;
          if (pointOnRoadSegment(x, y, index)) return null;
        }

        let bestDistanceSquared = Infinity;
        let bestBoundaryX = 0;
        let bestBoundaryY = 0;
        let bestInwardX = 0;
        let bestInwardY = 0;
        for (let index = 0; index < track.length; index++) {
          const next = (index + 1) % track.length;
          const leftStart = roadLeftBoundary[index];
          const leftEnd = roadLeftBoundary[next];
          const rightStart = roadRightBoundary[index];
          const rightEnd = roadRightBoundary[next];
          if (pointOnRoadSegment(x, y, index)) return null;
          const centerStart = track[index];
          const centerEnd = track[next];
          for (let side = 0; side < 2; side++) {
            const start = side === 0 ? leftStart : rightStart;
            const end = side === 0 ? leftEnd : rightEnd;
            const closest = closestPointOnSegment(x, y, start, end);
            const dx = x - closest.x;
            const dy = y - closest.y;
            const distanceSquared = dx * dx + dy * dy;
            if (distanceSquared < bestDistanceSquared) {
              bestDistanceSquared = distanceSquared;
              bestBoundaryX = closest.x;
              bestBoundaryY = closest.y;
              const centerX = centerStart.x + (centerEnd.x - centerStart.x) * closest.t;
              const centerY = centerStart.y + (centerEnd.y - centerStart.y) * closest.t;
              const inwardLength = Math.hypot(centerX - closest.x, centerY - closest.y) || 1;
              bestInwardX = (centerX - closest.x) / inwardLength;
              bestInwardY = (centerY - closest.y) / inwardLength;
            }
          }
        }
        return {
          x: bestBoundaryX,
          y: bestBoundaryY,
          inwardX: bestInwardX,
          inwardY: bestInwardY
        };
      }

      function pointAt(progress) {
        const scaled = ((progress % 1) + 1) % 1 * track.length;
        const index = Math.floor(scaled);
        const t = scaled - index;
        const a = track[index];
        const b = track[(index + 1) % track.length];
        const before = track[(index - 1 + track.length) % track.length];
        const after = track[(index + 2) % track.length];
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const tx = (b.x - before.x) * (1 - t) + (after.x - a.x) * t;
        const ty = (b.y - before.y) * (1 - t) + (after.y - a.y) * t;
        return { x, y, angle: Math.atan2(ty, tx) };
      }

      function nearestTrack(x, y, preferredIndex = null) {
        let bestDistance = Infinity;
        let bestIndex = 0;
        let bestT = 0;
        let bestX = track[0].x;
        let bestY = track[0].y;
        const searchRadius = preferredIndex === null ? track.length : 80;
        const firstOffset = preferredIndex === null ? 0 : -searchRadius;
        const lastOffset = preferredIndex === null ? track.length - 1 : searchRadius;
        const considerSegment = index => {
          const i = (index + track.length) % track.length;
          const point = track[i];
          const next = track[(i + 1) % track.length];
          const segmentX = next.x - point.x;
          const segmentY = next.y - point.y;
          const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
          const t = Math.max(0, Math.min(1,
            ((x - point.x) * segmentX + (y - point.y) * segmentY) / segmentLengthSquared
          ));
          const closestX = point.x + segmentX * t;
          const closestY = point.y + segmentY * t;
          const dx = x - closestX;
          const dy = y - closestY;
          const distance = dx * dx + dy * dy;
          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = i;
            bestT = t;
            bestX = closestX;
            bestY = closestY;
          }
        };
        for (let offset = firstOffset; offset <= lastOffset; offset++) {
          considerSegment(preferredIndex === null ? offset : preferredIndex + offset);
        }
        if (preferredIndex !== null && bestDistance > 400 * 400) {
          for (let i = 0; i < track.length; i++) considerSegment(i);
        }
        const segmentLength = trackDistances[bestIndex + 1] - trackDistances[bestIndex];
        const distanceAlong = trackDistances[bestIndex] + segmentLength * bestT;
        return {
          distance: Math.sqrt(bestDistance),
          progress: distanceAlong / trackLength,
          distanceAlong,
          index: bestIndex,
          x: bestX,
          y: bestY
        };
      }

      function createRacer(name, color, accent, player, startProgress, lane, speed, skill) {
        const p = pointAt(startProgress);
        const side = p.angle + Math.PI / 2;
        const x = p.x + Math.cos(side) * lane;
        const y = p.y + Math.sin(side) * lane;
        const initialTrack = nearestTrack(x, y);
        return {
          name, color, accent, player, x, y,
          angle: p.angle, vx: 0, vy: 0, progress: startProgress, lastProgress: startProgress,
          lastTrackX: x, lastTrackY: y, trackDistance: initialTrack.distanceAlong,
          trackIndex: initialTrack.index,
          raceTrackDistance: 0, furthestTrackDistance: 0, lapDistance: 0,
          laps: 0, boost: player ? 1 : 0, boostMax: 1, boostPower: 0,
          boostRechargeDelay: 0, boostSpent: 0, boosting: false,
          aiSpeed: player ? 0 : 232 * (.97 + Math.random() * .06),
          aiBoostTimer: .8 + Math.random() * 3.2, aiBoostCooldown: 0,
          aiAccuracy: player ? 1 : .7 + Math.random() * .28,
          aiLane: player ? lane : lane + (Math.random() - .5) * 8,
          skill: Math.max(.45, Math.min(.98, skill + (Math.random() - .5) * .26)),
          driftAmount: 0, finished: false, finishTime: 0, offRoad: 0,
          wallHits: 0, topSpeed: 0, bestLapTime: null,
          lapStart: 0, collisionCooldown: 0
        };
      }

      const player = createRacer('YOU', '#c6532d', '#c6a985', true, START_PROGRESS, 0, 0, 0);
      racers.push(player);
      racers.push(createRacer('MINT', '#46755b', '#b5c798', false, START_PROGRESS, 50, 0, .82));
      racers.push(createRacer('BERRY', '#715790', '#bba9d3', false, START_PROGRESS, -50, 0, .74));
      racers.push(createRacer('SUNNY', '#b58a28', '#d8c68d', false, START_PROGRESS, 100, 0, .7));
      racers.push(createRacer('INK', '#46515b', '#aab8bd', false, START_PROGRESS, -100, 0, .77));

      const props = [
        { type: 'monitor', worldX: -300, worldZ: -1600, angle: Math.PI, scale: 1.55 },
        { type: 'keyboard', worldX: -300, worldZ: -1200, scale: 1.25 },
        { type: 'mouse', worldX: 420, worldZ: -1180, scale: 1.25 },
        { type: 'paperStack', worldX: 1150, worldZ: -1700, width: 780, depth: 500, sheets: 36, scale: 1.5 },
        { type: 'binderClip', worldX: 1150, worldZ: -1700, baseY: 490, scale: 1.35 },
        { type: 'folder', worldX: 2200, worldZ: -1750, angle: -.09, color: '#748166', scale: 1.35 },
        { type: 'paper', worldX: 2900, worldZ: -1800, w: 130, h: 90, angle: -.14, scale: 1.35 },
        { type: 'calculator', worldX: 800, worldZ: -1510, angle: .08 },
        { type: 'pen', worldX: 1220, worldZ: -1740, angle: -.4, color: '#3e596c' },
        { type: 'stapler', worldX: -1580, worldZ: -1430, angle: .08, scale: 1.35 },
        { type: 'stickyNotes', worldX: -1550, worldZ: -1600, scale: 1.35 },
        { type: 'book', worldX: -1330, worldZ: 1850, w: 155, h: 110, angle: -.12, color: '#45664e', label: 'FIELD NOTES', scale: 1.4 },
        { type: 'notebook', worldX: -790, worldZ: 2110, angle: .04, scale: 1.3 },
        { type: 'paperStack', worldX: -1800, worldZ: 2220, width: 500, depth: 380, sheets: 11 },
        { type: 'ruler', worldX: -1250, worldZ: 2290, angle: .12 },
        { type: 'glasses', worldX: -300, worldZ: 2010, angle: .18 },
        { type: 'mug', worldX: 1700, worldZ: 700, angle: Math.PI, r: 58, color: '#eee3d0', scale: 2.1 },
        { type: 'penholder', worldX: 1330, worldZ: 1020, scale: 1.3 },
        { type: 'pencil', worldX: -1180, worldZ: 2070, angle: .42, length: 140, color: '#d99b30' },
        { type: 'pencil', worldX: -930, worldZ: 2110, angle: -.3, length: 126, color: '#bc5140' },
        { type: 'paperStack', worldX: 2850, worldZ: 1900, width: 650, depth: 500, sheets: 28, scale: 1.4 },
        { type: 'tapeDispenser', worldX: 2550, worldZ: 1150, scale: 1.3 },
        { type: 'phone', worldX: 600, worldZ: 1640, angle: .12, scale: 1.3 },
        { type: 'book', worldX: -1250, worldZ: 2370, w: 135, h: 100, angle: .1, color: '#b15a48', label: 'IDEAS' },
        { type: 'scissors', worldX: 200, worldZ: 1510, angle: -.2 },
        { type: 'paper', worldX: 950, worldZ: 1770, w: 120, h: 85, angle: -.16 },
        { type: 'pen', worldX: 1210, worldZ: 1780, angle: .25, color: '#bd493c' },
        { type: 'calculator', worldX: 1880, worldZ: 1880, angle: -.14 },
        { type: 'deskLamp', worldX: 2580, worldZ: 1500, scale: 1.3 },
        { type: 'penholder', worldX: -2050, worldZ: 1920, scale: 1.25 },
        { type: 'paperStack', worldX: -2700, worldZ: -2200, width: 650, depth: 440, sheets: 14 },
        { type: 'notebook', worldX: 1450, worldZ: -2190, angle: -.08 },
        { type: 'stapler', worldX: 1450, worldZ: -580, angle: -.16, scale: 1.4 },
        { type: 'paperStack', worldX: 1820, worldZ: -780, width: 560, depth: 420, sheets: 20, scale: 1.3 },
        { type: 'folder', worldX: 2380, worldZ: -530, angle: .13, color: '#9a7657', scale: 1.2 },
        { type: 'pencil', worldX: 1450, worldZ: -1000, angle: -.5, length: 165, color: '#d99b30', scale: 1.5 },
        { type: 'scissors', worldX: -1900, worldZ: -350, angle: .24, scale: 1.4 },
        { type: 'stickyNotes', worldX: -1750, worldZ: 100, scale: 1.5 },
        { type: 'book', worldX: -200, worldZ: 1510, w: 185, h: 125, angle: -.2, color: '#526c78', label: 'MEETING NOTES', scale: 1.3 },
        { type: 'phone', worldX: 1050, worldZ: 1450, angle: .16, scale: 1.4 },
        { type: 'tapeDispenser', worldX: 1550, worldZ: 1100, scale: 1.35 },
        { type: 'mug', worldX: 1730, worldZ: -1130, angle: .3, r: 48, color: '#d8d0bf', scale: 1.5 },
        { type: 'paperStack', worldX: -300, worldZ: 175, width: 320, depth: 240, sheets: 16, scale: .55 },
        { type: 'stickyNotes', worldX: -600, worldZ: 325, scale: .42 },
        { type: 'calculator', worldX: -100, worldZ: 300, angle: .12, scale: .38 },
        { type: 'mug', worldX: -450, worldZ: 0, angle: -.3, r: 24, color: '#e2d8c7' },
        { type: 'waterBottle', worldX: 800, worldZ: 1000, angle: -.12, scale: 1.15 },
        { type: 'tumbler', worldX: 1300, worldZ: -300, angle: .16, scale: 1.1 },
        { type: 'eraser', worldX: 1500, worldZ: 0, angle: -.32, color: '#d98778', scale: 1.5 },
        { type: 'highlighter', worldX: 500, worldZ: 1450, angle: .42, color: '#d9ca58', scale: 1.25 },
        { type: 'paperClips', worldX: -1200, worldZ: 1200, scale: 1.2 }
      ];

      function drawSparks() {
        for (const spark of sparks) {
          const ratio = Math.max(0, spark.life / spark.maxLife);
          spark.mesh.position.set(spark.x, 8 + (1 - ratio) * 15, spark.y);
          spark.mesh.scale.setScalar(Math.max(.2, ratio));
          spark.mesh.material.opacity = ratio;
        }
      }

      function emitSmoke(car) {
        const x = car.x - Math.cos(car.angle) * 37;
        const z = car.y - Math.sin(car.angle) * 37;
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(2.4, 6, 5),
          new THREE.MeshBasicMaterial({ color: '#c3c7c5', transparent: true, opacity: .22, depthWrite: false })
        );
        mesh.position.set(x, 13, z);
        scene.add(mesh);
        smokeParticles.push({
          mesh, x, z,
          vx: -Math.cos(car.angle) * (12 + Math.random() * 17) + (Math.random() - .5) * 12,
          vz: -Math.sin(car.angle) * (12 + Math.random() * 17) + (Math.random() - .5) * 12,
          life: .35 + Math.random() * .15, maxLife: .5, rise: 5 + Math.random() * 3
        });
      }

      function updateSmoke(dt) {
        for (let i = smokeParticles.length - 1; i >= 0; i--) {
          const particle = smokeParticles[i];
          particle.life -= dt;
          particle.x += particle.vx * dt;
          particle.z += particle.vz * dt;
          particle.mesh.position.set(particle.x, 13 + (particle.maxLife - particle.life) * particle.rise, particle.z);
          const lifeRatio = Math.max(0, particle.life / particle.maxLife);
          particle.mesh.scale.setScalar(1 + (1 - lifeRatio) * .8);
          particle.mesh.material.opacity = .22 * lifeRatio;
          if (particle.life <= 0) {
            scene.remove(particle.mesh);
            particle.mesh.geometry.dispose();
            particle.mesh.material.dispose();
            smokeParticles.splice(i, 1);
          }
        }
      }

      function emitSparks(x, y, nx, ny) {
        for (let i = 0; i < 13; i++) {
          const angle = Math.atan2(ny, nx) + (Math.random() - .5) * 1.8;
          const speed = 55 + Math.random() * 145;
          const life = .25 + Math.random() * .3;
          const material = new THREE.MeshBasicMaterial({
            color: i % 3 === 0 ? '#fff0a8' : i % 3 === 1 ? '#f28b43' : '#f7e8c7',
            transparent: true
          });
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(3 + Math.random() * 2, 6, 5), material);
          scene.add(mesh);
          sparks.push({
            x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            life, maxLife: life, size: 2 + Math.random() * 3,
            mesh
          });
        }
      }

      function updateSparks(dt) {
        for (let i = sparks.length - 1; i >= 0; i--) {
          const spark = sparks[i];
          spark.life -= dt;
          spark.x += spark.vx * dt;
          spark.y += spark.vy * dt;
          spark.vx *= Math.max(0, 1 - 3 * dt);
          spark.vy *= Math.max(0, 1 - 3 * dt);
          if (spark.life <= 0) {
            scene.remove(spark.mesh);
            spark.mesh.geometry.dispose();
            spark.mesh.material.dispose();
            sparks.splice(i, 1);
          }
        }
      }

      function createMaterial(color, roughness = .78, extra = {}) {
        const adjustedColor = new THREE.Color(color).multiplyScalar(.78);
        return new THREE.MeshStandardMaterial({ color: adjustedColor, roughness, ...extra });
      }

      function addBox(parent, width, height, depth, material, x, y, z) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
      }

      function getSoftShadowTexture(shape) {
        if (softShadowTextures.has(shape)) return softShadowTextures.get(shape);
        const shadowCanvas = document.createElement('canvas');
        shadowCanvas.width = 128;
        shadowCanvas.height = 128;
        const context = shadowCanvas.getContext('2d');
        const drawSilhouette = (offsetX, offsetY, blur, color) => {
          context.save();
          context.translate(offsetX, offsetY);
          context.shadowColor = color;
          context.shadowBlur = blur;
          context.fillStyle = color;
          context.beginPath();
          if (shape === 'car') {
            context.moveTo(64, 10);
            context.lineTo(80, 24);
            context.lineTo(87, 43);
            context.lineTo(87, 88);
            context.lineTo(78, 111);
            context.lineTo(50, 111);
            context.lineTo(41, 88);
            context.lineTo(41, 43);
            context.lineTo(48, 24);
            context.closePath();
            context.fill();
            context.fillRect(34, 38, 12, 20);
            context.fillRect(82, 38, 12, 20);
            context.fillRect(34, 77, 12, 20);
            context.fillRect(82, 77, 12, 20);
          } else if (shape === 'plant') {
            context.ellipse(64, 70, 14, 17, 0, 0, TAU);
            for (let i = 0; i < 7; i++) {
              const angle = (i / 7) * TAU;
              context.ellipse(64 + Math.cos(angle) * 24, 42 + Math.sin(angle) * 24, 10, 23, angle, 0, TAU);
            }
            context.fill();
          } else if (shape === 'mug') {
            context.ellipse(58, 64, 29, 31, 0, 0, TAU);
            context.moveTo(83, 53);
            context.bezierCurveTo(111, 45, 111, 83, 83, 76);
            context.lineWidth = 9;
            context.strokeStyle = color;
            context.stroke();
            context.fill();
          } else if (shape === 'waterBottle' || shape === 'tumbler' || shape === 'penholder' || shape === 'mouse') {
            context.ellipse(64, 64, 36, 43, 0, 0, TAU);
            context.fill();
          } else if (shape === 'pen' || shape === 'pencil' || shape === 'ruler' || shape === 'highlighter' || shape === 'eraser') {
            context.roundRect(9, 49, 110, 30, 12);
            context.fill();
          } else if (shape === 'glasses' || shape === 'paperClips') {
            context.ellipse(41, 64, 25, 21, 0, 0, TAU);
            context.ellipse(87, 64, 25, 21, 0, 0, TAU);
            context.fill();
            if (shape === 'glasses') {
              context.fillRect(62, 60, 5, 7);
              context.fillRect(9, 61, 12, 5);
              context.fillRect(107, 61, 12, 5);
            }
          } else if (shape === 'desk') {
            context.roundRect(17, 15, 94, 69, 7);
            context.fill();
            context.ellipse(64, 101, 19, 14, 0, 0, TAU);
            context.fill();
          } else if (shape === 'stickyNotes') {
            context.fillRect(21, 27, 49, 48);
            context.fillRect(52, 50, 55, 54);
            context.fillRect(29, 63, 49, 42);
          } else if (shape === 'deskLamp') {
            context.ellipse(64, 99, 38, 16, 0, 0, TAU);
            context.moveTo(62, 91);
            context.lineTo(77, 42);
            context.lineTo(67, 40);
            context.lineTo(55, 88);
            context.closePath();
            context.fill();
            context.moveTo(59, 43);
            context.lineTo(43, 19);
            context.lineTo(92, 20);
            context.lineTo(78, 44);
            context.closePath();
            context.fill();
          } else if (shape === 'tapeDispenser') {
            context.roundRect(13, 68, 103, 30, 9);
            context.fill();
            context.ellipse(72, 58, 25, 25, 0, 0, TAU);
            context.fill();
          } else if (shape === 'stapler') {
            context.moveTo(15, 79);
            context.lineTo(24, 46);
            context.lineTo(98, 39);
            context.lineTo(115, 68);
            context.lineTo(108, 90);
            context.closePath();
            context.fill();
          } else if (shape === 'calculator' || shape === 'phone' || shape === 'keyboard' || shape === 'monitor') {
            context.roundRect(14, 14, 100, 100, 8);
            context.fill();
          } else if (shape === 'scissors') {
            context.ellipse(34, 47, 18, 18, 0, 0, TAU);
            context.ellipse(34, 81, 18, 18, 0, 0, TAU);
            context.moveTo(44, 53);
            context.lineTo(111, 23);
            context.lineTo(116, 30);
            context.lineTo(50, 67);
            context.lineTo(116, 98);
            context.lineTo(111, 105);
            context.lineTo(44, 75);
            context.closePath();
            context.fill();
          } else if (shape === 'plantPot') {
            context.moveTo(38, 35);
            context.lineTo(90, 35);
            context.lineTo(83, 107);
            context.lineTo(45, 107);
            context.closePath();
            context.fill();
          } else {
            context.roundRect(14, 17, 100, 94, 5);
            context.fill();
          }
          context.restore();
        };
        drawSilhouette(9, 10, 8, 'rgba(18,14,10,.48)');
        drawSilhouette(0, 0, 1, 'rgba(18,14,10,.42)');
        const texture = new THREE.CanvasTexture(shadowCanvas);
        softShadowTextures.set(shape, texture);
        return texture;
      }

      function getBoostGlowTexture() {
        if (boostGlowTexture) return boostGlowTexture;
        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = 128;
        glowCanvas.height = 128;
        const context = glowCanvas.getContext('2d');
        const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62);
        gradient.addColorStop(0, 'rgba(130,237,255,.92)');
        gradient.addColorStop(.24, 'rgba(48,190,255,.6)');
        gradient.addColorStop(.62, 'rgba(25,128,255,.2)');
        gradient.addColorStop(1, 'rgba(25,128,255,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 128, 128);
        boostGlowTexture = new THREE.CanvasTexture(glowCanvas);
        return boostGlowTexture;
      }

      function addSoftShadow(parent, width, depth, x, y, z, shape = 'box') {
        const shadow = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({
            map: getSoftShadowTexture(shape),
            color: '#494239',
            transparent: true,
            opacity: .94,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1
          })
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(x, y + .75, z);
        shadow.scale.set(width, depth, 1);
        shadow.renderOrder = 1;
        shadow.castShadow = false;
        shadow.receiveShadow = false;
        parent.add(shadow);
        return shadow;
      }

      function makeLabelTexture(text, background, ink) {
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 512;
        labelCanvas.height = 256;
        const labelContext = labelCanvas.getContext('2d');
        labelContext.fillStyle = background;
        labelContext.fillRect(0, 0, labelCanvas.width, labelCanvas.height);
        labelContext.strokeStyle = 'rgba(70,65,54,.2)';
        labelContext.lineWidth = 3;
        for (let y = 115; y < 245; y += 31) {
          labelContext.beginPath();
          labelContext.moveTo(40, y);
          labelContext.lineTo(472, y);
          labelContext.stroke();
        }
        labelContext.fillStyle = ink;
        labelContext.font = 'bold 37px "DM Mono", monospace';
        labelContext.textAlign = 'center';
        labelContext.fillText(text, 256, 80);
        const texture = new THREE.CanvasTexture(labelCanvas);
        if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
        else texture.encoding = THREE.sRGBEncoding;
        return texture;
      }

      function addDeskProp(prop) {
        const group = new THREE.Group();
        const baseY = prop.baseY === undefined ? 4 : prop.baseY;
        const propScale = prop.scale || 1;
        group.position.set(
          prop.worldX === undefined ? (prop.x - 500) * WORLD_SCALE : prop.worldX,
          baseY,
          prop.worldZ === undefined ? (prop.y - 350) * WORLD_SCALE : prop.worldZ
        );
        group.scale.setScalar(propScale);
        group.rotation.y = -(prop.angle || 0);
        scene.add(group);
        const woodShadow = createMaterial('#755a37');
        const shadowWidth = prop.type === 'paperStack'
          ? (prop.width || 600) * 1.2
          : prop.type === 'mug'
            ? prop.r * WORLD_SCALE * 3.4
            : 460;
        const shadowDepth = prop.type === 'paperStack'
          ? (prop.depth || 420) * 1.2
          : prop.type === 'mug'
            ? prop.r * WORLD_SCALE * 2.7
            : 340;
        addSoftShadow(
          group,
          shadowWidth / propScale,
          shadowDepth / propScale,
          62 / propScale,
          (4.15 - baseY) / propScale,
          78 / propScale,
          prop.type
        );

        if (prop.type === 'book') {
          const width = prop.w * WORLD_SCALE;
          const depth = prop.h * WORLD_SCALE;
          const cover = createMaterial(prop.color);
          addBox(group, width, 17, depth, woodShadow, 8, 10, -7);
          addBox(group, width, 15, depth, cover, 0, 19, 0);
          addBox(group, width - 40, 3, depth - 38, createMaterial('#f7edda'), 4, 28, 0);
          const texture = makeLabelTexture(prop.label, '#f7edda', '#615b4e');
          const label = new THREE.Mesh(
            new THREE.PlaneGeometry(width - 48, depth - 46),
            new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
          );
          label.rotation.x = -Math.PI / 2;
          label.position.set(4, 30, 0);
          group.add(label);
        } else if (prop.type === 'mug') {
          const radius = prop.r * WORLD_SCALE;
          const mug = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius * .9, radius * 1.45, 32),
            createMaterial(prop.color)
          );
          mug.position.y = radius * .72;
          mug.castShadow = true;
          group.add(mug);
          const coffee = new THREE.Mesh(
            new THREE.CircleGeometry(radius * .78, 28),
            new THREE.MeshStandardMaterial({ color: '#8e573e', side: THREE.DoubleSide, roughness: .3 })
          );
          coffee.rotation.x = -Math.PI / 2;
          coffee.position.y = radius * 1.43;
          group.add(coffee);
          const handle = new THREE.Mesh(
            new THREE.TorusGeometry(radius * .48, radius * .13, 10, 22),
            createMaterial('#a35d45')
          );
          handle.position.set(radius * .88, radius * .78, 0);
          group.add(handle);
        } else if (prop.type === 'waterBottle') {
          const glass = new THREE.MeshPhysicalMaterial({
            color: '#9fc7c3',
            roughness: .12,
            metalness: .04,
            transparent: true,
            opacity: .48,
            clearcoat: .9,
            clearcoatRoughness: .08
          });
          const bottle = new THREE.Mesh(new THREE.CylinderGeometry(43, 48, 245, 24, 1, true), glass);
          bottle.position.y = 134;
          group.add(bottle);
          const base = new THREE.Mesh(
            new THREE.CylinderGeometry(48, 44, 16, 24),
            createMaterial('#73a9a5', .24, { metalness: .16 })
          );
          base.position.y = 16;
          group.add(base);
          const water = new THREE.Mesh(
            new THREE.CylinderGeometry(39, 43, 132, 24),
            new THREE.MeshPhysicalMaterial({
              color: '#88c9d4',
              roughness: .12,
              transparent: true,
              opacity: .42,
              clearcoat: .8
            })
          );
          water.position.y = 83;
          group.add(water);
          const neck = new THREE.Mesh(new THREE.CylinderGeometry(22, 34, 36, 20), glass);
          neck.position.y = 274;
          group.add(neck);
          const cap = new THREE.Mesh(
            new THREE.CylinderGeometry(25, 25, 30, 20),
            createMaterial('#d5eee5', .24, { metalness: .12 })
          );
          cap.position.y = 307;
          group.add(cap);
          for (let y = 287; y <= 298; y += 7) {
            const band = new THREE.Mesh(
              new THREE.TorusGeometry(24, 2.2, 6, 20),
              createMaterial('#718b83', .32, { metalness: .28 })
            );
            band.rotation.x = Math.PI / 2;
            band.position.y = y;
            group.add(band);
          }
        } else if (prop.type === 'tumbler') {
          const steel = new THREE.MeshPhysicalMaterial({
            color: '#a9b3ad',
            roughness: .2,
            metalness: .72,
            clearcoat: .75,
            clearcoatRoughness: .16
          });
          const body = new THREE.Mesh(new THREE.CylinderGeometry(63, 48, 255, 28, 1, true), steel);
          body.position.y = 132;
          group.add(body);
          const bottom = new THREE.Mesh(
            new THREE.CylinderGeometry(48, 48, 13, 28),
            createMaterial('#59625f', .28, { metalness: .65 })
          );
          bottom.position.y = 8;
          group.add(bottom);
          const rim = new THREE.Mesh(
            new THREE.TorusGeometry(61, 5, 8, 28),
            createMaterial('#dce3de', .18, { metalness: .78 })
          );
          rim.rotation.x = Math.PI / 2;
          rim.position.y = 260;
          group.add(rim);
          const lid = new THREE.Mesh(
            new THREE.CylinderGeometry(65, 61, 24, 28),
            createMaterial('#424b49', .24, { metalness: .42 })
          );
          lid.position.y = 270;
          group.add(lid);
          const sip = new THREE.Mesh(
            new THREE.CylinderGeometry(13, 13, 8, 16),
            createMaterial('#222a2a', .38)
          );
          sip.position.set(0, 284, 12);
          group.add(sip);
          addBox(group, 110, 8, 16, createMaterial('#d6d8cd', .22, { metalness: .72 }), 0, 104, 47);
        } else if (prop.type === 'eraser') {
          const eraser = addBox(
            group, 170, 55, 86,
            createMaterial(prop.color || '#e5d7c4', .58),
            0, 29, 0
          );
          eraser.rotation.y = -.08;
          addBox(group, 3, 58, 88, createMaterial('#f0e7d6', .78), -55, 29, 0);
        } else if (prop.type === 'highlighter') {
          const ink = createMaterial(prop.color || '#ddcf4e', .34, { metalness: .08 });
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 270, 12), ink);
          barrel.rotation.z = Math.PI / 2;
          barrel.position.y = 18;
          group.add(barrel);
          const cap = new THREE.Mesh(
            new THREE.CylinderGeometry(27, 27, 52, 12),
            createMaterial('#eee4bf', .28)
          );
          cap.rotation.z = Math.PI / 2;
          cap.position.set(-158, 18, 0);
          group.add(cap);
          const nib = new THREE.Mesh(
            new THREE.ConeGeometry(19, 32, 8),
            createMaterial(prop.color || '#ddcf4e', .4)
          );
          nib.rotation.z = -Math.PI / 2;
          nib.position.set(151, 18, 0);
          group.add(nib);
          addBox(group, 8, 6, 145, createMaterial('#f3e8c7', .28), 12, 39, 0);
        } else if (prop.type === 'paperClips') {
          const metal = createMaterial('#9ca5a1', .22, { metalness: .82 });
          for (let i = 0; i < 7; i++) {
            const clip = new THREE.Mesh(
              new THREE.TorusGeometry(30 + (i % 3) * 5, 4, 6, 18, Math.PI * 1.75),
              metal
            );
            clip.rotation.x = Math.PI / 2 + (i % 2) * .2;
            clip.rotation.z = (i - 3) * .13;
            clip.position.set((i % 4) * 24 - 36, 8 + (i % 3) * 2, Math.floor(i / 4) * 18 - 9);
            group.add(clip);
          }
        } else if (prop.type === 'pencil') {
          const length = prop.length * WORLD_SCALE;
          const pencil = addBox(group, length - 12, 11, 13, createMaterial(prop.color), 0, 7, 0);
          const eraser = addBox(group, 14, 12, 15, createMaterial('#c7c2b8'), -length / 2 + 2, 7, 0);
          const tip = new THREE.Mesh(
            new THREE.ConeGeometry(8, 22, 5),
            createMaterial('#f1dcae')
          );
          tip.rotation.z = -Math.PI / 2;
          tip.position.set(length / 2 - 3, 7, 0);
          tip.castShadow = true;
          group.add(tip);
          pencil.receiveShadow = true;
          eraser.castShadow = true;
        } else if (prop.type === 'paper') {
          const width = prop.w * WORLD_SCALE;
          const depth = prop.h * WORLD_SCALE;
          addBox(group, width, 4, depth, createMaterial('#fff8e8'), 0, 4, 0);
          const ruled = createMaterial('#d6cebc');
          for (let i = 0; i < 5; i++) {
            addBox(group, width - 50, 1, 2, ruled, 0, 6.5, -depth / 2 + 35 + i * 30);
          }
        } else if (prop.type === 'paperStack') {
          const width = prop.width || 600;
          const depth = prop.depth || 420;
          const stackHeight = prop.sheets * 9;
          addBox(group, width, stackHeight, depth, createMaterial('#eee9dc', .9), 0, stackHeight / 2, 0);
          const pageEdge = createMaterial('#c8c1b2', .9);
          for (let i = 0; i < 6; i++) {
            addBox(group, width - 14, 2, 4, pageEdge, 0, 12 + i * Math.max(8, stackHeight / 7), depth / 2 + 2);
          }
          const clip = new THREE.Mesh(
            new THREE.BoxGeometry(54, 24, 20),
            createMaterial('#858780', .32, { metalness: .62 })
          );
          clip.position.set(width * .31, stackHeight + 16, -depth * .34);
          group.add(clip);
        } else if (prop.type === 'folder') {
          const folder = createMaterial(prop.color, .75);
          addBox(group, 700, 12, 460, createMaterial('#d2c8b1'), 12, 6, 8);
          const cover = addBox(group, 710, 18, 470, folder, 0, 18, 0);
          cover.rotation.x = -.015;
          addBox(group, 190, 8, 25, createMaterial('#d8cda9'), 210, 30, -190);
          addBox(group, 95, 4, 6, createMaterial('#a7a08d'), 216, 35, -190);
        } else if (prop.type === 'notebook') {
          addBox(group, 520, 26, 390, createMaterial('#e4d9c3'), 8, 13, 8);
          addBox(group, 530, 18, 400, createMaterial('#566c65'), 0, 25, 0);
          addBox(group, 476, 3, 350, createMaterial('#f0e8d6'), 0, 36, 8);
          for (let i = 0; i < 6; i++) {
            const ring = new THREE.Mesh(
              new THREE.TorusGeometry(13, 3.5, 6, 12, Math.PI),
              createMaterial('#8d918f', .3, { metalness: .65 })
            );
            ring.rotation.z = Math.PI / 2;
            ring.position.set(-190 + i * 76, 47, -176);
            group.add(ring);
          }
          for (let i = 0; i < 7; i++) {
            addBox(group, 370, 2, 2, createMaterial('#c8bdab'), 0, 38, -110 + i * 38);
          }
        } else if (prop.type === 'stickyNotes') {
          const colors = ['#e8ce6b', '#edb59d', '#9cb9a1', '#e9d98f'];
          for (let i = 0; i < 4; i++) {
            addBox(
              group, 210, 5, 190, createMaterial(colors[i]),
              (i % 2) * 140 - 70, 3 + i * 2, (i >> 1) * 120 - 60
            );
          }
        } else if (prop.type === 'mouse') {
          const mouse = new THREE.Mesh(
            new THREE.SphereGeometry(98, 20, 14),
            createMaterial('#414747', .38)
          );
          mouse.scale.set(.72, .35, 1.15);
          mouse.position.y = 34;
          group.add(mouse);
          addBox(group, 4, 8, 85, createMaterial('#737873', .38), 0, 66, -4);
          const wheel = new THREE.Mesh(
            new THREE.CylinderGeometry(11, 11, 6, 12),
            createMaterial('#a29c8e', .35)
          );
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(0, 67, 31);
          group.add(wheel);
        } else if (prop.type === 'ruler') {
          addBox(group, 820, 13, 72, createMaterial('#d6b967', .55), 0, 7, 0);
          for (let i = 0; i < 21; i++) {
            addBox(group, 3, 3, i % 5 === 0 ? 26 : 14, createMaterial('#66553a'), -390 + i * 39, 15, -18);
          }
        } else if (prop.type === 'pen') {
          const pen = new THREE.Mesh(
            new THREE.CylinderGeometry(12, 12, 360, 10),
            createMaterial(prop.color || '#3e596c', .35, { metalness: .2 })
          );
          pen.rotation.z = Math.PI / 2;
          pen.position.y = 13;
          group.add(pen);
          const cap = new THREE.Mesh(
            new THREE.CylinderGeometry(13, 13, 62, 10),
            createMaterial('#c5b99e', .35, { metalness: .24 })
          );
          cap.rotation.z = Math.PI / 2;
          cap.position.set(-205, 13, 0);
          group.add(cap);
          addBox(group, 16, 7, 4, createMaterial('#bdc0b9', .35, { metalness: .55 }), -145, 24, 12);
        } else if (prop.type === 'calculator') {
          addBox(group, 300, 34, 390, createMaterial('#4d5351', .55), 0, 17, 0);
          const display = addBox(group, 236, 8, 86, createMaterial('#8d9c8b', .32), 0, 38, -115);
          display.rotation.x = -.04;
          for (let row = 0; row < 4; row++) {
            for (let column = 0; column < 4; column++) {
              addBox(
                group, 46, 12, 42,
                createMaterial((row === 3 && column === 3) ? '#c4864e' : '#c4c1b5', .52),
                -93 + column * 62, 41, -35 + row * 69
              );
            }
          }
        } else if (prop.type === 'phone') {
          const body = createMaterial('#353a3b', .35, { metalness: .16 });
          const phone = addBox(group, 220, 28, 390, body, 0, 14, 0);
          phone.rotation.x = -.035;
          const screen = new THREE.Mesh(
            new THREE.PlaneGeometry(185, 335),
            new THREE.MeshBasicMaterial({ color: '#263d48' })
          );
          screen.rotation.x = -Math.PI / 2;
          screen.position.set(0, 30, 0);
          group.add(screen);
          addBox(group, 115, 5, 5, createMaterial('#738c89'), 0, 33, -110);
          const button = new THREE.Mesh(new THREE.CircleGeometry(11, 14), createMaterial('#a9aaa1'));
          button.rotation.x = -Math.PI / 2;
          button.position.set(0, 31, 160);
          group.add(button);
        } else if (prop.type === 'glasses') {
          const frame = createMaterial('#353534', .3, { metalness: .15 });
          for (const side of [-1, 1]) {
            const lens = new THREE.Mesh(new THREE.TorusGeometry(58, 8, 9, 28), frame);
            lens.position.set(side * 68, 18, 0);
            group.add(lens);
            const temple = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 205, 8), frame);
            temple.rotation.x = Math.PI / 2;
            temple.position.set(side * 132, 22, 98);
            group.add(temple);
          }
          addBox(group, 25, 8, 10, frame, 0, 18, 0);
        } else if (prop.type === 'tapeDispenser') {
          const base = createMaterial('#8a9b9a', .35, { metalness: .13 });
          addBox(group, 290, 40, 170, base, 0, 20, 0);
          const roll = new THREE.Mesh(
            new THREE.TorusGeometry(72, 24, 12, 30),
            createMaterial('#ded9c8', .3)
          );
          roll.position.set(-25, 112, 0);
          group.add(roll);
          const cutter = new THREE.Mesh(
            new THREE.BoxGeometry(74, 9, 14),
            createMaterial('#b7b9b5', .3, { metalness: .6 })
          );
          cutter.position.set(120, 50, 0);
          group.add(cutter);
        } else if (prop.type === 'deskLamp') {
          const metal = createMaterial('#4b5151', .35, { metalness: .45 });
          const base = new THREE.Mesh(new THREE.CylinderGeometry(130, 150, 25, 28), metal);
          base.position.y = 13;
          group.add(base);
          addBox(group, 150, 18, 70, metal, 0, 28, 35);
          const lowerArm = new THREE.Mesh(new THREE.CylinderGeometry(16, 19, 380, 12), metal);
          lowerArm.position.set(0, 210, 20);
          lowerArm.rotation.z = -.12;
          group.add(lowerArm);
          const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(14, 16, 320, 12), metal);
          upperArm.position.set(90, 410, -90);
          upperArm.rotation.z = .58;
          group.add(upperArm);
          const shade = new THREE.Mesh(
            new THREE.CylinderGeometry(72, 190, 175, 24, 1, true),
            createMaterial('#d7d0c2', .55, { side: THREE.DoubleSide })
          );
          shade.position.set(175, 555, -180);
          shade.rotation.z = Math.PI;
          group.add(shade);
          const bulb = new THREE.Mesh(
            new THREE.SphereGeometry(34, 14, 10),
            new THREE.MeshBasicMaterial({ color: '#ffe4a0' })
          );
          bulb.position.set(175, 475, -180);
          group.add(bulb);
        } else if (prop.type === 'binderClip') {
          const metal = createMaterial('#343b3c', .28, { metalness: .65 });
          addBox(group, 180, 14, 130, createMaterial('#d7d1c2'), 0, 7, 0);
          for (const side of [-1, 1]) {
            const handle = new THREE.Mesh(new THREE.TorusGeometry(27, 4, 8, 18, Math.PI), metal);
            handle.position.set(side * 43, 39, -50);
            group.add(handle);
          }
          addBox(group, 100, 45, 12, metal, 0, 31, -55);
        } else if (prop.type === 'monitor') {
          const metal = createMaterial('#30383a', .48, { metalness: .2 });
          addBox(group, 780, 38, 440, createMaterial('#292c2b'), 0, 19, 0);
          addBox(group, 740, 19, 412, createMaterial('#48483f'), 0, 43, 0);
          addBox(group, 690, 470, 35, metal, 0, 320, -115);
          const displayCanvas = document.createElement('canvas');
          displayCanvas.width = 640;
          displayCanvas.height = 406;
          const displayContext = displayCanvas.getContext('2d');
          const wallpaper = displayContext.createLinearGradient(0, 0, 640, 406);
          wallpaper.addColorStop(0, '#48677a');
          wallpaper.addColorStop(1, '#293e50');
          displayContext.fillStyle = wallpaper;
          displayContext.fillRect(0, 0, 640, 406);
          displayContext.fillStyle = '#d6d5cc';
          displayContext.fillRect(18, 20, 604, 38);
          displayContext.fillStyle = '#53636a';
          displayContext.fillRect(28, 30, 174, 12);
          displayContext.fillStyle = '#283439';
          displayContext.fillRect(34, 80, 572, 284);
          displayContext.fillStyle = '#e1ddd1';
          displayContext.fillRect(54, 102, 212, 16);
          displayContext.fillStyle = '#aab7b5';
          for (let row = 0; row < 7; row++) {
            displayContext.fillRect(54, 143 + row * 27, 180 + (row % 3) * 32, 5);
          }
          displayContext.fillStyle = '#7e9aa0';
          displayContext.fillRect(310, 104, 272, 110);
          displayContext.fillStyle = '#c89662';
          displayContext.fillRect(310, 230, 123, 108);
          displayContext.fillStyle = '#789078';
          displayContext.fillRect(445, 230, 137, 108);
          const displayTexture = new THREE.CanvasTexture(displayCanvas);
          if ('colorSpace' in displayTexture) displayTexture.colorSpace = THREE.SRGBColorSpace;
          else displayTexture.encoding = THREE.sRGBEncoding;
          const screenMaterial = new THREE.MeshBasicMaterial({ map: displayTexture });
          addBox(group, 640, 406, 8, screenMaterial, 0, 326, -94);
          addBox(group, 42, 148, 36, metal, 0, 80, -115);
          addBox(group, 210, 20, 130, metal, 0, 12, -100);
        } else if (prop.type === 'keyboard') {
          const keyboardCanvas = document.createElement('canvas');
          keyboardCanvas.width = 700;
          keyboardCanvas.height = 245;
          const keyboardContext = keyboardCanvas.getContext('2d');
          keyboardContext.fillStyle = '#343938';
          keyboardContext.fillRect(0, 0, 700, 245);
          keyboardContext.fillStyle = '#81837d';
          for (let row = 0; row < 5; row++) {
            for (let column = 0; column < 15; column++) {
              keyboardContext.fillRect(15 + column * 45, 12 + row * 42, 34, 31);
            }
          }
          keyboardContext.fillStyle = '#b3ad9e';
          keyboardContext.fillRect(255, 216, 190, 20);
          const keyboardTexture = new THREE.CanvasTexture(keyboardCanvas);
          if ('colorSpace' in keyboardTexture) keyboardTexture.colorSpace = THREE.SRGBColorSpace;
          else keyboardTexture.encoding = THREE.sRGBEncoding;
          const keyboard = new THREE.Mesh(
            new THREE.BoxGeometry(700, 24, 245),
            new THREE.MeshStandardMaterial({ map: keyboardTexture, roughness: .65 })
          );
          keyboard.position.y = 12;
          keyboard.castShadow = true;
          group.add(keyboard);
        } else if (prop.type === 'penholder') {
          const cup = new THREE.Mesh(
            new THREE.CylinderGeometry(82, 68, 160, 14, 1, true),
            createMaterial('#465047', .65, { metalness: .18, side: THREE.DoubleSide })
          );
          cup.position.y = 80;
          group.add(cup);
          const base = new THREE.Mesh(new THREE.CylinderGeometry(68, 68, 12, 14), woodShadow);
          base.position.y = 6;
          group.add(base);
          for (let i = 0; i < 7; i++) {
            const pencil = new THREE.Mesh(
              new THREE.CylinderGeometry(7, 4, 235 + (i % 3) * 24, 6),
              createMaterial(['#d99b30', '#bc5140', '#405d80'][i % 3])
            );
            pencil.position.set(-48 + (i % 4) * 31, 206 + (i % 3) * 7, -24 + Math.floor(i / 4) * 36);
            pencil.rotation.z = (i % 2 ? 1 : -1) * .1;
            group.add(pencil);
          }
        } else if (prop.type === 'stapler') {
          const base = createMaterial('#323b3c', .4, { metalness: .22 });
          addBox(group, 235, 24, 100, base, 0, 12, 0);
          const arm = new THREE.Mesh(
            new THREE.BoxGeometry(205, 43, 67),
            createMaterial('#a84437', .38, { metalness: .16 })
          );
          arm.position.set(0, 39, -5);
          arm.rotation.z = -.14;
          group.add(arm);
          addBox(group, 56, 6, 18, createMaterial('#b9b9ae', .35, { metalness: .5 }), 0, 60, -10);
        } else if (prop.type === 'scissors') {
          const metal = createMaterial('#b4b7b1', .3, { metalness: .65 });
          const handle = createMaterial('#485a61');
          for (const side of [-1, 1]) {
            const loop = new THREE.Mesh(new THREE.TorusGeometry(49, 12, 10, 22), handle);
            loop.position.set(side * 44, 20, 32);
            group.add(loop);
            const blade = new THREE.Mesh(new THREE.BoxGeometry(17, 10, 235), metal);
            blade.position.set(side * 21, 24, -105);
            blade.rotation.y = side * .08;
            group.add(blade);
          }
        }
      }

      function createOfficeFloorTexture() {
        const textureCanvas = document.createElement('canvas');
        textureCanvas.width = 1024;
        textureCanvas.height = 1024;
        const textureContext = textureCanvas.getContext('2d');
        textureContext.fillStyle = '#777b78';
        textureContext.fillRect(0, 0, 1024, 1024);
        for (let i = 0; i < 8000; i++) {
          const shade = Math.floor(95 + Math.random() * 40);
          textureContext.fillStyle = `rgba(${shade},${shade},${shade},.12)`;
          textureContext.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
        }
        const texture = new THREE.CanvasTexture(textureCanvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(16, 16);
        if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
        else texture.encoding = THREE.sRGBEncoding;
        return texture;
      }

      function createDeskWoodTexture() {
        const textureCanvas = document.createElement('canvas');
        textureCanvas.width = 2048;
        textureCanvas.height = 1024;
        const context = textureCanvas.getContext('2d');
        const gradient = context.createLinearGradient(0, 0, 0, 1024);
        gradient.addColorStop(0, '#d5b17e');
        gradient.addColorStop(.48, '#e2c18d');
        gradient.addColorStop(1, '#cda875');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 2048, 1024);
        for (let i = 0; i < 90; i++) {
          const y = Math.random() * 1024;
          context.strokeStyle = i % 3 === 0 ? 'rgba(111,72,36,.36)' : 'rgba(255,239,202,.34)';
          context.lineWidth = 2 + Math.random() * 5;
          context.beginPath();
          context.moveTo(0, y);
          context.bezierCurveTo(540, y - 42, 1350, y + 36, 2048, y - 14);
          context.stroke();
        }
        for (let i = 0; i < 18; i++) {
          const x = Math.random() * 2048;
          const y = Math.random() * 1024;
          context.strokeStyle = 'rgba(119,75,37,.24)';
          context.lineWidth = 2;
          context.beginPath();
          context.ellipse(x, y, 28 + Math.random() * 24, 5 + Math.random() * 5, 0, 0, TAU);
          context.stroke();
        }
        const texture = new THREE.CanvasTexture(textureCanvas);
        if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
        else texture.encoding = THREE.sRGBEncoding;
        return texture;
      }

      function addOfficeFurniture(x, z, rotation = 0) {
        const group = new THREE.Group();
        group.position.set(x, -510, z);
        group.rotation.y = rotation;
        group.scale.setScalar(2.2);
        scene.add(group);
        addSoftShadow(group, 780 / 2.2, 520 / 2.2, 70 / 2.2, .15 / 2.2, 90 / 2.2, 'desk');

        const deskTop = createMaterial('#735239');
        const deskEdge = createMaterial('#302d29');
        const metal = createMaterial('#343b3e', .55, { metalness: .28 });
        const screen = createMaterial('#252d31', .32);
        const screenGlow = new THREE.MeshBasicMaterial({ color: '#38545a' });
        addBox(group, 240, 16, 135, deskTop, 0, 88, 0);
        addBox(group, 245, 6, 139, deskEdge, 0, 78, 0);
        for (const side of [-1, 1]) {
          for (const end of [-1, 1]) {
            addBox(group, 9, 76, 9, metal, side * 100, 39, end * 50);
          }
        }
        addBox(group, 92, 61, 8, screen, 0, 126, -37);
        addBox(group, 78, 43, 2, screenGlow, 0, 128, -31);
        addBox(group, 34, 5, 31, metal, 0, 116, -23);
        addBox(group, 82, 6, 29, createMaterial('#3d4548'), 0, 98, 42);
        addBox(group, 9, 61, 8, createMaterial('#4c5558'), -111, 42, 0);

        const chair = new THREE.Group();
        chair.position.set(0, 0, 132);
        group.add(chair);
        const seat = new THREE.Mesh(
          new THREE.CylinderGeometry(34, 38, 14, 12),
          createMaterial('#42565c')
        );
        seat.position.y = 40;
        chair.add(seat);
        addBox(chair, 54, 66, 12, createMaterial('#34464c'), 0, 78, 33);
        const chairPost = new THREE.Mesh(
          new THREE.CylinderGeometry(5, 7, 37, 10),
          metal
        );
        chairPost.position.y = 19;
        chair.add(chairPost);

        return group;
      }

      function addOfficePlant(x, z, scale = 1) {
        const group = new THREE.Group();
        group.position.set(x, -510, z);
        group.scale.setScalar(scale);
        scene.add(group);
        addSoftShadow(group, 120 / scale, 120 / scale, 28 / scale, .15 / scale, 36 / scale, 'plant');
        const pot = new THREE.Mesh(
          new THREE.CylinderGeometry(20, 15, 31, 9),
          createMaterial('#8a5743')
        );
        pot.position.y = 15;
        group.add(pot);
        const soil = new THREE.Mesh(new THREE.CircleGeometry(16, 9), createMaterial('#302d25'));
        soil.rotation.x = -Math.PI / 2;
        soil.position.y = 31;
        group.add(soil);
        const greens = createMaterial('#365a41');
        const leafLight = createMaterial('#56734a');
        for (let i = 0; i < 7; i++) {
          const angle = (i / 7) * TAU;
          const leaf = new THREE.Mesh(
            new THREE.ConeGeometry(9 + (i % 2) * 2, 66 + (i % 3) * 9, 5),
            i % 2 ? greens : leafLight
          );
          leaf.position.set(Math.cos(angle) * 14, 61 + (i % 2) * 5, Math.sin(angle) * 14);
          leaf.rotation.z = Math.cos(angle) * -.42;
          leaf.rotation.x = Math.sin(angle) * .42;
          group.add(leaf);
        }
        return group;
      }

      function addOfficeEnvironment() {
        const wall = createMaterial('#bbb4ad');
        const trim = createMaterial('#504b48');
        const frame = createMaterial('#383b3c', .45, { metalness: .22 });
        const skylineCanvas = document.createElement('canvas');
        skylineCanvas.width = 1200;
        skylineCanvas.height = 420;
        const skylineContext = skylineCanvas.getContext('2d');
        const sky = skylineContext.createLinearGradient(0, 0, 0, 420);
        sky.addColorStop(0, '#a8b8c0');
        sky.addColorStop(1, '#e0cbb1');
        skylineContext.fillStyle = sky;
        skylineContext.fillRect(0, 0, 1200, 420);
        skylineContext.fillStyle = '#8c9698';
        for (let building = 0; building < 19; building++) {
          const x = building * 68 - 20;
          const width = 38 + (building % 3) * 13;
          const height = 95 + ((building * 83) % 215);
          skylineContext.fillRect(x, 420 - height, width, height);
          skylineContext.fillStyle = 'rgba(235,218,184,.56)';
          for (let wx = x + 7; wx < x + width - 3; wx += 13) {
            for (let wy = 420 - height + 12; wy < 410; wy += 25) {
              skylineContext.fillRect(wx, wy, 5, 9);
            }
          }
          skylineContext.fillStyle = '#8c9698';
        }
        const skylineTexture = new THREE.CanvasTexture(skylineCanvas);
        if ('colorSpace' in skylineTexture) skylineTexture.colorSpace = THREE.SRGBColorSpace;
        else skylineTexture.encoding = THREE.sRGBEncoding;
        const glass = new THREE.MeshBasicMaterial({ map: skylineTexture });
        const roomHalf = 9200;
        const roomSize = roomHalf * 2;
        const floorY = -510;
        const wallHeight = 5200;
        const wallCenter = floorY + wallHeight / 2;
        addBox(scene, roomSize, wallHeight, 72, wall, 0, wallCenter, -roomHalf);
        addBox(scene, 72, wallHeight, roomSize, wall, -roomHalf, wallCenter, 0);
        addBox(scene, 72, wallHeight, roomSize, wall, roomHalf, wallCenter, 0);
        addBox(scene, roomSize, wallHeight, 72, wall, 0, wallCenter, roomHalf);

        addBox(scene, roomSize, 180, 94, trim, 0, floorY + 90, -roomHalf + 35);
        addBox(scene, roomSize, 180, 94, trim, 0, floorY + 90, roomHalf - 35);
        addBox(scene, 94, 180, roomSize, trim, -roomHalf + 35, floorY + 90, 0);
        addBox(scene, 94, 180, roomSize, trim, roomHalf - 35, floorY + 90, 0);

        const windowZ = -roomHalf + 50;
        const windowGlare = new THREE.MeshBasicMaterial({
          color: '#fff8e7',
          transparent: true,
          opacity: .14,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        for (let x = -7000; x <= 7000; x += 3500) {
          addBox(scene, 1780, 3000, 24, glass, x, 1900, windowZ);
          addBox(scene, 54, 3100, 54, frame, x - 890, 1900, windowZ + 24);
          addBox(scene, 54, 3100, 54, frame, x + 890, 1900, windowZ + 24);
          addBox(scene, 36, 3000, 58, frame, x, 1900, windowZ + 24);
          addBox(scene, 1780, 42, 58, frame, x, 650, windowZ + 24);
          addBox(scene, 1780, 42, 58, frame, x, 3150, windowZ + 24);
          const glareShape = new THREE.Shape();
          glareShape.moveTo(-790, -1350);
          glareShape.lineTo(-610, -1350);
          glareShape.lineTo(210, 1350);
          glareShape.lineTo(45, 1350);
          glareShape.closePath();
          const glare = new THREE.Mesh(new THREE.ShapeGeometry(glareShape), windowGlare);
          glare.position.set(x - 300, 1900, windowZ + 13);
          scene.add(glare);
          const thinGlareShape = new THREE.Shape();
          thinGlareShape.moveTo(430, -1350);
          thinGlareShape.lineTo(490, -1350);
          thinGlareShape.lineTo(860, 1350);
          thinGlareShape.lineTo(805, 1350);
          thinGlareShape.closePath();
          const thinGlare = new THREE.Mesh(new THREE.ShapeGeometry(thinGlareShape), windowGlare);
          thinGlare.position.set(x - 300, 1900, windowZ + 13);
          scene.add(thinGlare);
        }

        const artFrame = createMaterial('#56524d', .48, { metalness: .18 });
        const artPaper = createMaterial('#e8dfcf', .8);
        const artLightHousing = createMaterial('#45494a', .48, { metalness: .2 });
        const artColors = ['#a85f4b', '#738578', '#d0ad6f', '#637987'];
        for (let i = 0; i < 4; i++) {
          const gallery = new THREE.Group();
          const addGalleryBox = (...args) => {
            const mesh = addBox(gallery, ...args);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
          };
          const x = -5250 + i * 3500;
          addGalleryBox(1280, 1620, 42, artFrame, x, 1950, -9130);
          addGalleryBox(1210, 1550, 10, artPaper, x, 1950, -9092);
          addGalleryBox(790, 680, 12, createMaterial(artColors[i]), x - 110, 2050, -9076);
          addGalleryBox(400, 330, 13, createMaterial(artColors[(i + 1) % artColors.length]), x + 265, 1630, -9055);
          addGalleryBox(620, 28, 12, createMaterial('#a9a08e'), x - 35, 1320, -9068);
          addGalleryBox(740, 20, 28, artLightHousing, x, 2785, -9075);
          addGalleryBox(650, 10, 9, new THREE.MeshBasicMaterial({ color: '#ffe8b1' }), x, 2768, -9057);
          scene.add(gallery);
        }

        const backGallery = new THREE.Group();
        const addBackGalleryBox = (...args) => {
          const mesh = addBox(backGallery, ...args);
          mesh.castShadow = false;
          mesh.receiveShadow = false;
        };
        for (let i = 0; i < 4; i++) {
          const x = -5250 + i * 3500;
          addBackGalleryBox(1280, 1620, 42, artFrame, x, 1950, 9130);
          addBackGalleryBox(1210, 1550, 10, artPaper, x, 1950, 9092);
          addBackGalleryBox(790, 680, 12, createMaterial(artColors[(i + 2) % artColors.length]), x - 110, 2050, 9076);
          addBackGalleryBox(400, 330, 13, createMaterial(artColors[(i + 3) % artColors.length]), x + 265, 1630, 9055);
          addBackGalleryBox(620, 28, 12, createMaterial('#a9a08e'), x - 35, 1320, 9068);
          addBackGalleryBox(740, 20, 28, artLightHousing, x, 2785, 9075);
          addBackGalleryBox(650, 10, 9, new THREE.MeshBasicMaterial({ color: '#ffe8b1' }), x, 2768, 9057);
        }
        scene.add(backGallery);

        function addWallDecor(x, z, rotation, variant) {
          const decor = new THREE.Group();
          decor.position.set(x, 1930, z);
          decor.rotation.y = rotation;
          scene.add(decor);
          const paper = createMaterial('#e9e0d0', .82);
          const frame = createMaterial('#4f5352', .42, { metalness: .2 });
          const colors = ['#ad634e', '#73877b', '#d2ad6d', '#5f7580'];
          addBox(decor, 1220, 1440, 48, frame, 0, 0, 0);
          addBox(decor, 1160, 1380, 10, paper, 0, 0, 36);
          addBox(decor, 700, 610, 12, createMaterial(colors[variant % colors.length]), -110, 145, 52);
          addBox(decor, 365, 300, 13, createMaterial(colors[(variant + 1) % colors.length]), 275, -215, 56);
          addBox(decor, 590, 24, 12, createMaterial('#a49b89'), -25, -520, 56);
          addBox(decor, 780, 20, 40, frame, 0, 790, 36);
          addBox(decor, 700, 10, 14, new THREE.MeshBasicMaterial({ color: '#ffe7ae' }), 0, 772, 64);
          decor.traverse(child => {
            if (child.isMesh) {
              child.castShadow = false;
              child.receiveShadow = false;
            }
          });
        }

        for (let i = 0; i < 2; i++) {
          const z = i === 0 ? -7500 : 7500;
          addWallDecor(-9130, z, Math.PI / 2, i + 2);
          addWallDecor(9130, z, -Math.PI / 2, i + 3);
        }
        for (const z of [-4000, 0, 4000]) {
          addWallDecor(-9130, z, Math.PI / 2, z === 0 ? 0 : 1);
          addWallDecor(9130, z, -Math.PI / 2, z === 0 ? 2 : 3);
        }

        for (const wallX of [-roomHalf + 50, roomHalf - 50]) {
          for (let z = -6000; z <= 6000; z += 4000) {
            addBox(scene, 20, 2850, 1880, glass, wallX, 1800, z);
            addBox(scene, 54, 2950, 54, frame, wallX - Math.sign(wallX) * 22, 1800, z - 940);
            addBox(scene, 54, 2950, 54, frame, wallX - Math.sign(wallX) * 22, 1800, z + 940);
            addBox(scene, 60, 2850, 54, frame, wallX - Math.sign(wallX) * 22, 1800, z);
          }
        }

        for (let i = 0; i < 2; i++) {
          const x = -4200 + i * 8400;
          const cabinet = createMaterial(i % 2 ? '#727675' : '#77736e');
          addBox(scene, 1160, 1220, 740, cabinet, x, floorY + 610, -7100);
          addBox(scene, 1190, 44, 775, frame, x, floorY + 1234, -7100);
          for (let drawer = 0; drawer < 4; drawer++) {
            const y = floorY + 165 + drawer * 255;
            addBox(scene, 1040, 224, 16, createMaterial('#92918a'), x, y, -6720);
            addBox(scene, 90, 18, 16, frame, x, y, -6705);
          }
          for (let folder = 0; folder < 4; folder++) {
            const height = 300 + (folder % 3) * 70;
            addBox(
              scene, 150, height, 290,
              createMaterial(['#6b7667', '#9a7657', '#687887'][folder % 3]),
              x - 300 + folder * 190,
              floorY + 1256 + height / 2,
              -7100
            );
          }
        }

        const officePositions = [
          [-6500, -6100, .08], [1500, -6800, -.08], [6500, 500, Math.PI / 2],
          [3500, 6500, Math.PI], [-5000, 6200, Math.PI]
        ];
        for (const [x, z, rotation] of officePositions) {
          addOfficeFurniture(x, z, rotation);
        }

        const plantPositions = [
          [-8400, -4300], [-3100, -7700], [8200, -4500], [8350, 3600]
        ];
        for (const [index, [x, z]] of plantPositions.entries()) {
          addOfficePlant(x, z, index % 3 === 0 ? 1.5 : 1.2);
        }

        const fixtureHousing = createMaterial('#45494a', .48, { metalness: .2 });
        const ceilingLights = new THREE.MeshBasicMaterial({ color: '#fff0c9' });
        for (let row = 0; row < 2; row++) {
          for (let column = 0; column < 3; column++) {
            const x = -5000 + column * 5000;
            const z = -3000 + row * 6000;
            addBox(scene, 960, 52, 200, fixtureHousing, x, 3550, z);
            const diffuser = new THREE.Mesh(new THREE.BoxGeometry(820, 12, 132), ceilingLights);
            diffuser.position.set(x, 3520, z);
            scene.add(diffuser);
            for (const end of [-1, 1]) {
              addBox(scene, 34, 60, 210, frame, x + end * 438, 3550, z);
            }
          }
        }
      }

      function addDeskSurface() {
        const wood = new THREE.MeshStandardMaterial({
          map: createDeskWoodTexture(),
          color: '#fff4dd',
          roughness: .63
        });
        const edge = createMaterial('#b98d5c');
        const apron = createMaterial('#8a6544');
        addBox(scene, 7420, 86, 5820, apron, 0, -49, 0);
        const top = new THREE.Mesh(new THREE.BoxGeometry(7380, 10, 5780), wood);
        top.position.set(0, -1, 0);
        top.receiveShadow = true;
        scene.add(top);
        addBox(scene, 7440, 26, 28, edge, 0, -7, -2880);
        addBox(scene, 7440, 26, 28, edge, 0, -7, 2880);
        addBox(scene, 28, 26, 5780, edge, -3700, -7, 0);
        addBox(scene, 28, 26, 5780, edge, 3700, -7, 0);

        const legs = createMaterial('#79583d');
        for (const x of [-3260, 3260]) {
          for (const z of [-2440, 2440]) {
            addBox(scene, 190, 480, 190, legs, x, -270, z);
          }
        }
      }

      function makeTrackStrip(halfWidth, height, material) {
        const vertices = [];
        const indices = [];
        for (let i = 0; i < track.length; i++) {
          const leftPoint = trackOffsetPoint(i, halfWidth);
          const rightPoint = trackOffsetPoint(i, -halfWidth);
          vertices.push(leftPoint.x, height, leftPoint.z);
          vertices.push(rightPoint.x, height, rightPoint.z);
          const next = (i + 1) % track.length;
          const leftIndex = i * 2;
          const rightIndex = leftIndex + 1;
          const nextLeft = next * 2;
          const nextRight = nextLeft + 1;
          indices.push(leftIndex, nextLeft, rightIndex, nextLeft, nextRight, rightIndex);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        const surfaceMaterial = material.clone();
        surfaceMaterial.side = THREE.DoubleSide;
        const mesh = new THREE.Mesh(geometry, surfaceMaterial);
        mesh.receiveShadow = false;
        mesh.castShadow = false;
        scene.add(mesh);
        return mesh;
      }

      function makeTrackEdgeMarkings() {
        const material = new THREE.MeshBasicMaterial({
          color: '#f5f2e8',
          side: THREE.DoubleSide
        });
        for (const side of [-1, 1]) {
          const vertices = [];
          const indices = [];
          const halfMarkWidth = 3.2;
          const offset = ROAD_HALF - 6.5;
          for (let i = 0; i < track.length; i++) {
            for (const distance of [offset - halfMarkWidth, offset + halfMarkWidth]) {
              const point = trackOffsetPoint(i, distance * side);
              vertices.push(point.x, ROAD_SURFACE_Y + .7, point.z);
            }
            const next = (i + 1) % track.length;
            const current = i * 2;
            const nextVertex = next * 2;
            indices.push(current, current + 1, nextVertex, current + 1, nextVertex + 1, nextVertex);
          }
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
          geometry.setIndex(indices);
          geometry.computeVertexNormals();
          scene.add(new THREE.Mesh(geometry, material));
        }
      }

      function makeCarModel(car) {
        const group = new THREE.Group();
        addSoftShadow(
          group,
          66,
          84,
          0,
          ROAD_SURFACE_Y + .15 - CAR_RIDE_HEIGHT,
          0,
          'car'
        );
        const bodyMaterial = createMaterial(car.color, .43, { metalness: .12 });
        const accentMaterial = createMaterial(car.accent, .35);
        const glassMaterial = createMaterial('#a9c6c5', .22, { metalness: .14, transparent: true, opacity: .86 });
        const blackMaterial = createMaterial('#27251f', .7);
        const trimMaterial = createMaterial('#343536', .42, { metalness: .38 });
        const lightsMaterial = new THREE.MeshStandardMaterial({ color: '#fff2c7', emissive: '#ffd17c', emissiveIntensity: 1.35 });
        const tailMaterial = new THREE.MeshStandardMaterial({ color: '#ff5946', emissive: '#d52b1d', emissiveIntensity: 1.4 });

        addBox(group, 33, 9, 51, bodyMaterial, 0, 12, 0);
        addBox(group, 26, 5, 30, accentMaterial, 0, 19, -1);
        addBox(group, 23, 11, 21, glassMaterial, 0, 25, -4);
        addBox(group, 23, 3, 8, accentMaterial, 0, 31, -4);
        addBox(group, 34, 4, 7, trimMaterial, 0, 9, 27);
        addBox(group, 15, 3, 3, blackMaterial, 0, 12, 27);
        addBox(group, 8, 5, 4, lightsMaterial, -11, 14, 26);
        addBox(group, 8, 5, 4, lightsMaterial, 11, 14, 26);
        addBox(group, 9, 5, 4, tailMaterial, -11, 14, -26);
        addBox(group, 9, 5, 4, tailMaterial, 11, 14, -26);
        addBox(group, 25, 3, 4, trimMaterial, 0, 8, -27);
        addBox(group, 3, 2, 39, trimMaterial, -16, 11, 0);
        addBox(group, 3, 2, 39, trimMaterial, 16, 11, 0);
        for (const side of [-1, 1]) {
          for (const end of [-1, 1]) {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 10, 14), blackMaterial);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(side * 18, 8, end * 16);
            group.add(wheel);
            const hub = new THREE.Mesh(
              new THREE.CylinderGeometry(2.8, 2.8, 10.5, 12),
              createMaterial('#a9aaa2', .28, { metalness: .62 })
            );
            hub.rotation.z = Math.PI / 2;
            hub.position.copy(wheel.position);
            group.add(hub);
          }
        }
        for (const side of [-1, 1]) {
          addBox(group, 7, 4, 8, trimMaterial, side * 18, 23, 3);
          const mirror = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 7), bodyMaterial);
          mirror.position.set(side * 22, 22, 7);
          group.add(mirror);
        }
        addBox(group, 17, 2, 3, new THREE.MeshBasicMaterial({ color: '#d9eeee' }), 0, 28, 5);
        const driverBody = new THREE.Mesh(
          new THREE.SphereGeometry(7.5, 12, 10),
          createMaterial('#34434a', .58)
        );
        driverBody.scale.set(.82, 1.05, .68);
        driverBody.position.set(0, 20, -6);
        group.add(driverBody);
        const driverHead = new THREE.Mesh(
          new THREE.SphereGeometry(3.3, 14, 12),
          createMaterial('#d6a77e', .66)
        );
        driverHead.position.set(0, 26.5, -7);
        group.add(driverHead);
        const helmet = new THREE.Mesh(
          new THREE.SphereGeometry(3.6, 14, 10, 0, TAU, 0, Math.PI * .62),
          createMaterial('#354044', .34, { metalness: .12 })
        );
        helmet.position.set(0, 28.7, -7);
        group.add(helmet);
        addBox(group, 1.2, .7, 5, createMaterial(car.accent, .36), 0, 31, -7.3);
        const visor = new THREE.Mesh(
          new THREE.BoxGeometry(5.6, 1.8, 1.4),
          new THREE.MeshStandardMaterial({ color: '#24383e', roughness: .18, metalness: .28 })
        );
        visor.position.set(0, 28.6, -1.5);
        group.add(visor);
        if (car.player) {
          const stripe = addBox(group, 4, 1, 43, accentMaterial, 0, 17, 0);
          stripe.castShadow = false;
        }
        const flameOuter = new THREE.MeshBasicMaterial({
          color: '#21bfff', transparent: true, opacity: .86, depthWrite: false
        });
        const flameCore = new THREE.MeshBasicMaterial({
          color: '#d8fbff', transparent: true, opacity: .96, depthWrite: false
        });
        car.boostGlow = new THREE.Mesh(
          new THREE.PlaneGeometry(170, 220),
          new THREE.MeshBasicMaterial({
            map: getBoostGlowTexture(),
            transparent: true,
            opacity: .32,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
          })
        );
        car.boostGlow.rotation.x = -Math.PI / 2;
        car.boostGlow.position.set(0, ROAD_SURFACE_Y + .35 - CAR_RIDE_HEIGHT, -27);
        car.boostGlow.visible = false;
        group.add(car.boostGlow);
        car.boostLight = new THREE.PointLight('#47caff', .75, 150, 2);
        car.boostLight.position.set(0, ROAD_SURFACE_Y + 9 - CAR_RIDE_HEIGHT, -32);
        car.boostLight.visible = false;
        group.add(car.boostLight);
        car.flames = [];
        for (const side of [-1, 1]) {
          for (const [radius, length, offset, material] of [
            [5.5, 34, -44, flameOuter],
            [2.8, 25, -39.5, flameCore]
          ]) {
            const flame = new THREE.Mesh(new THREE.ConeGeometry(radius, length, 9), material);
            flame.rotation.x = -Math.PI / 2;
            flame.position.set(side * 7, 11, offset);
            flame.visible = false;
            group.add(flame);
            car.flames.push(flame);
          }
        }
        group.traverse(child => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
          }
        });
        car.boostGlow.castShadow = false;
        car.boostGlow.receiveShadow = false;
        scene.add(group);
        carMeshes.set(car, group);
        return group;
      }

      function addFinishLine() {
        const start = track[START_TRACK_INDEX];
        const miter = trackMiter(START_TRACK_INDEX);
        const normalX = miter.x;
        const normalZ = miter.z;
        const acrossAngle = Math.atan2(-normalZ, normalX);
        const group = new THREE.Group();
        group.position.set(start.x, ROAD_SURFACE_Y + .55, start.y);
        group.rotation.y = acrossAngle;
        scene.add(group);
        const roadHalfAtStart = ROAD_HALF * miter.scale;
        const tileSize = roadHalfAtStart * 2 / 12;
        const tileDepth = 18;
        const black = createMaterial('#34332f', .8);
        const cream = createMaterial('#f4e7ca', .85);
        for (let column = 0; column < 12; column++) {
          for (let row = 0; row < 2; row++) {
            const material = (column + row) % 2 === 0 ? cream : black;
            const tile = new THREE.Mesh(new THREE.BoxGeometry(tileSize, .5, tileDepth), material);
            tile.position.set(
              -roadHalfAtStart + tileSize * (column + .5),
              0,
              (row - .5) * tileDepth
            );
            tile.receiveShadow = true;
            group.add(tile);
          }
        }

        const gantry = new THREE.Group();
        gantry.position.set(start.x, 0, start.y);
        gantry.rotation.y = acrossAngle;
        scene.add(gantry);
        const support = createMaterial('#292f31', .48, { metalness: .32 });
        const sign = createMaterial('#e6dfca', .62);
        const postWidth = 13;
        const postLocalOffset = ROAD_HALF + 25 / 2 + 8;
        const postOffset = postLocalOffset * miter.scale;
        for (const side of [-1, 1]) {
          const edgePosition = trackOffsetPoint(START_TRACK_INDEX, side * postLocalOffset);
          const postX = edgePosition.x;
          const postZ = edgePosition.z;
          const post = addBox(scene, postWidth, 96, postWidth, support, postX, 48, postZ);
          post.rotation.y = acrossAngle;
          const foot = addBox(scene, 25, 10, 24, createMaterial('#d46750'), postX, 7, postZ);
          foot.rotation.y = acrossAngle;
        }
        const beamWidth = postOffset * 2 + postWidth;
        addBox(gantry, beamWidth, 15, 19, support, 0, 96, 0);
        const signWidth = beamWidth - 16;
        addBox(gantry, signWidth, 44, 5, sign, 0, 126, 0);

        const finishTexture = makeLabelTexture('FINISH', '#e8dfca', '#282c2b');
        const finishBoard = new THREE.Mesh(
          new THREE.PlaneGeometry(signWidth - 8, 38),
          new THREE.MeshBasicMaterial({ map: finishTexture, side: THREE.DoubleSide })
        );
        finishBoard.position.set(0, 126, 3.5);
        gantry.add(finishBoard);

        const bulbs = createMaterial('#f3c46d', .3, { emissive: '#e89132', emissiveIntensity: .9 });
        for (let i = 0; i < 5; i++) {
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(4.5, 10, 8), bulbs);
          bulb.position.set((i - 2) * 26, 96, 12);
          gantry.add(bulb);
        }
      }

      function createThreeScene() {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
        renderer.shadowMap.enabled = false;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = .82;
        if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
        else renderer.outputEncoding = THREE.sRGBEncoding;

        scene = new THREE.Scene();
        scene.background = new THREE.Color('#c1c7c1');
        scene.fog = new THREE.Fog('#c1c7c1', 7800, 15500);
        camera = new THREE.PerspectiveCamera(68, canvas.clientWidth / canvas.clientHeight, 1, 18000);

        scene.add(new THREE.HemisphereLight('#dfded2', '#343a3d', .62));
        const sun = new THREE.DirectionalLight('#fff0d1', 2.2);
        sun.intensity = 1.02;
        sun.position.set(-6200, 5600, -8500);
        sun.castShadow = false;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.camera.left = -5200;
        sun.shadow.camera.right = 5200;
        sun.shadow.camera.top = 5200;
        sun.shadow.camera.bottom = -5200;
        sun.shadow.camera.near = 1;
        sun.shadow.camera.far = 18000;
        sun.shadow.bias = -0.0002;
        sun.shadow.normalBias = .06;
        sun.shadow.radius = 2;
        scene.add(sun);

        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(22000, 22000),
          new THREE.MeshStandardMaterial({ map: createOfficeFloorTexture(), roughness: .86 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -510;
        floor.receiveShadow = true;
        scene.add(floor);

        addDeskSurface();
        addOfficeEnvironment();
        for (const prop of props) addDeskProp(prop);

        makeTrackStrip(
          ROAD_HALF,
          ROAD_SURFACE_Y,
          new THREE.MeshBasicMaterial({ color: '#343530', toneMapped: false, side: THREE.DoubleSide })
        );
        makeTrackEdgeMarkings();

        const dashMaterial = new THREE.MeshBasicMaterial({ color: '#dfd2b1' });
        for (let i = 6; i < track.length; i += 22) {
          const before = track[(i - 1 + track.length) % track.length];
          const after = track[(i + 1) % track.length];
          const dash = new THREE.Mesh(new THREE.BoxGeometry(29, 1, 5), dashMaterial);
          dash.position.set(track[i].x, ROAD_SURFACE_Y + .6, track[i].y);
          dash.rotation.y = Math.atan2(-(after.y - before.y), after.x - before.x);
          scene.add(dash);
        }

        addFinishLine();
        for (const car of racers) makeCarModel(car);

        const resize = () => {
          const width = canvas.clientWidth;
          const height = canvas.clientHeight;
          if (!width || !height) return;
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };
        window.addEventListener('resize', resize);
        if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
      }

      function renderScene(dt) {
        for (const car of racers) {
          const model = carMeshes.get(car);
          if (!model) continue;
          model.position.set(car.x, CAR_RIDE_HEIGHT, car.y);
          model.rotation.y = Math.PI / 2 - car.angle;
          if (car.boostGlow) {
            car.boostGlow.visible = car.boosting;
            car.boostGlow.material.opacity = .28 + Math.random() * .08;
            car.boostLight.visible = car.boosting;
            car.boostLight.intensity = .55 + Math.random() * .2;
          }
          if (car.flames) {
            for (const flame of car.flames) {
              flame.visible = car.boosting;
              flame.scale.setScalar(.78 + Math.random() * .45);
            }
          }
        }
        drawSparks();

        const forwardX = Math.cos(player.angle);
        const forwardZ = Math.sin(player.angle);
        const desiredCamera = new THREE.Vector3(
          player.x - forwardX * 68,
          40,
          player.y - forwardZ * 68
        );
        const lookTarget = new THREE.Vector3(
          player.x + forwardX * 116,
          12,
          player.y + forwardZ * 116
        );
        if (!cameraTargetReady) {
          camera.position.copy(desiredCamera);
          cameraTargetReady = true;
        } else {
          camera.position.lerp(desiredCamera, 1 - Math.exp(-6.2 * dt));
        }
        if (cameraShake > 0) {
          camera.position.x += (Math.random() - .5) * cameraShake * .45;
          camera.position.y += (Math.random() - .5) * cameraShake * .35;
          camera.position.z += (Math.random() - .5) * cameraShake * .45;
        }
        camera.lookAt(lookTarget);
        if (!portraitQuery.matches) renderer.render(scene, camera);
      }

      function updateControls() {
        for (const key of Object.keys(controls)) {
          controls[key] = keys.has(key) || touches.has(key);
        }
      }

      function wrapProgress(progress) {
        return ((progress % 1) + 1) % 1;
      }

      function updatePlayer(dt) {
        updateControls();
        const forwardX = Math.cos(player.angle);
        const forwardY = Math.sin(player.angle);
        let forwardSpeed = player.vx * forwardX + player.vy * forwardY;
        const lateralSpeed = player.vx * -forwardY + player.vy * forwardX;
        const steer = Math.max(-1, Math.min(1,
          Number(controls.right) - Number(controls.left) + tiltSteer
        ));
        const drifting = Math.abs(forwardSpeed) > 34 &&
          (controls.drift || (Math.abs(steer) > 0 && Math.abs(forwardSpeed) > 90));
        player.boosting = controls.boost && player.boost > 0;
        if (player.boosting) {
          const spent = Math.min(player.boost, .52 * dt);
          player.boost = Math.max(0, player.boost - spent);
          player.boostSpent += spent;
          player.boostRechargeDelay = 1.65;
        } else if (player.boostRechargeDelay > 0) {
          player.boostRechargeDelay = Math.max(0, player.boostRechargeDelay - dt);
        } else {
          player.boost = Math.min(player.boostMax, player.boost + .42 * dt);
        }
        const targetBoostPower = player.boosting ? 1 : 0;
        const boostResponse = player.boosting ? 4.5 : player.boost <= 0 ? 2.1 : 3.5;
        player.boostPower += (targetBoostPower - player.boostPower) * Math.min(1, boostResponse * dt);

        if (controls.gas) {
          player.vx += forwardX * 300 * dt;
          player.vy += forwardY * 300 * dt;
        }
        if (player.boosting) {
          player.vx += forwardX * 540 * dt;
          player.vy += forwardY * 540 * dt;
        }
        if (controls.brake) {
          if (forwardSpeed > 12) {
            player.vx -= forwardX * 440 * dt;
            player.vy -= forwardY * 440 * dt;
          } else {
            player.vx -= forwardX * 125 * dt;
            player.vy -= forwardY * 125 * dt;
          }
        }

        forwardSpeed = player.vx * forwardX + player.vy * forwardY;
        const speedFactor = Math.min(1, Math.abs(forwardSpeed) / 85);
        player.angle += steer * (1.15 + speedFactor * .92) * dt * (forwardSpeed < -5 ? -1 : 1);

        const newForwardX = Math.cos(player.angle);
        const newForwardY = Math.sin(player.angle);
        const newForwardSpeed = player.vx * newForwardX + player.vy * newForwardY;
        const grip = drifting ? 1.05 : 6.5;
        const damp = Math.max(0, 1 - grip * dt);
        const lateralX = -newForwardY;
        const lateralY = newForwardX;
        const updatedLateral = (player.vx * lateralX + player.vy * lateralY) * damp;

        player.vx = newForwardX * newForwardSpeed + lateralX * updatedLateral;
        player.vy = newForwardY * newForwardSpeed + lateralY * updatedLateral;
        const drag = Math.max(0, 1 - (controls.gas ? .55 : 1.35) * dt);
        player.vx *= drag;
        player.vy *= drag;

        const maxSpeed = 242 + 92 * player.boostPower;
        const speed = Math.hypot(player.vx, player.vy);
        if (speed > maxSpeed) {
          player.vx *= maxSpeed / speed;
          player.vy *= maxSpeed / speed;
        }

        player.driftAmount = lateralSpeed;

        player.x += player.vx * dt;
        player.y += player.vy * dt;
        player.x = Math.max(-WORLD_LIMIT_X, Math.min(WORLD_LIMIT_X, player.x));
        player.y = Math.max(-WORLD_LIMIT_Z, Math.min(WORLD_LIMIT_Z, player.y));
        const nearest = nearestTrack(player.x, player.y, player.trackIndex);
        const roadBoundary = nearestRoadBoundary(player.x, player.y, nearest.index);
        player.offRoad = roadBoundary ? Math.hypot(player.x - roadBoundary.x, player.y - roadBoundary.y) : 0;
        player.collisionCooldown = Math.max(0, player.collisionCooldown - dt);
        if (roadBoundary) {
          player.x = roadBoundary.x + roadBoundary.inwardX;
          player.y = roadBoundary.y + roadBoundary.inwardY;

          const outwardSpeed = -(player.vx * roadBoundary.inwardX + player.vy * roadBoundary.inwardY);
          if (outwardSpeed > 0) {
            player.vx += roadBoundary.inwardX * outwardSpeed * 1.55;
            player.vy += roadBoundary.inwardY * outwardSpeed * 1.55;
          }
          player.vx *= .97;
          player.vy *= .97;

          if (player.collisionCooldown <= 0) {
            emitSparks(player.x, player.y, -roadBoundary.inwardX, -roadBoundary.inwardY);
            player.wallHits++;
            player.collisionCooldown = .48;
            cameraShake = Math.max(cameraShake, 5);
          }
        }
        player.topSpeed = Math.max(player.topSpeed, Math.hypot(player.vx, player.vy) * .78);
        player.smokeTimer = (player.smokeTimer || 0) - dt;
        if (Math.hypot(player.vx, player.vy) > 55 && player.smokeTimer <= 0) {
          emitSmoke(player);
          player.smokeTimer = .095;
        }
        for (const rival of racers) {
          if (rival === player || rival.finished) continue;
          const distance = Math.hypot(player.x - rival.x, player.y - rival.y);
          if (distance < 42) {
            const nx = (player.x - rival.x) / Math.max(distance, 1);
            const ny = (player.y - rival.y) / Math.max(distance, 1);
            const overlap = (42 - distance) * .5;
            player.x += nx * overlap;
            player.y += ny * overlap;
            rival.x -= nx * overlap;
            rival.y -= ny * overlap;
            player.vx += nx * 38;
            player.vy += ny * 38;
            cameraShake = Math.max(cameraShake, 2.3);
          }
        }
        updateRaceProgress(player, dt);
      }

      function updateRaceProgress(car, dt) {
        let nearest = nearestTrack(car.x, car.y, car.trackIndex);
        const previousProgress = car.progress;
        const oldTrackDistance = car.trackDistance;
        let distanceDelta = nearest.distanceAlong - oldTrackDistance;
        if (distanceDelta > trackLength / 2) distanceDelta -= trackLength;
        else if (distanceDelta < -trackLength / 2) distanceDelta += trackLength;
        let nextRaceTrackDistance = car.raceTrackDistance + distanceDelta;

        if (car.player && nextRaceTrackDistance < car.furthestTrackDistance - MAX_REVERSE_TRACK_DISTANCE) {
          const allowedDelta = car.furthestTrackDistance - MAX_REVERSE_TRACK_DISTANCE - car.raceTrackDistance;
          const movementFraction = distanceDelta === 0 ? 0 : Math.max(0, Math.min(1, allowedDelta / distanceDelta));
          car.x = car.lastTrackX + (car.x - car.lastTrackX) * movementFraction;
          car.y = car.lastTrackY + (car.y - car.lastTrackY) * movementFraction;
          const forwardSpeed = car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
          if (forwardSpeed < 0) {
            car.vx -= Math.cos(car.angle) * forwardSpeed;
            car.vy -= Math.sin(car.angle) * forwardSpeed;
          }
          nearest = nearestTrack(car.x, car.y, car.trackIndex);
          distanceDelta = nearest.distanceAlong - oldTrackDistance;
          if (distanceDelta > trackLength / 2) distanceDelta -= trackLength;
          else if (distanceDelta < -trackLength / 2) distanceDelta += trackLength;
          nextRaceTrackDistance = car.raceTrackDistance + distanceDelta;
        }

        car.lastTrackX = car.x;
        car.lastTrackY = car.y;
        car.trackDistance = nearest.distanceAlong;
        car.trackIndex = nearest.index;
        car.progress = nearest.progress;
        car.raceTrackDistance = nextRaceTrackDistance;
        car.furthestTrackDistance = Math.max(car.furthestTrackDistance, car.raceTrackDistance);
        car.lapDistance += distanceDelta;

        const previousLapPosition = ((oldTrackDistance - START_TRACK_DISTANCE) % trackLength + trackLength) % trackLength;
        const currentLapPosition = ((nearest.distanceAlong - START_TRACK_DISTANCE) % trackLength + trackLength) % trackLength;
        const crossedFinishForward = distanceDelta > 0 &&
          previousLapPosition > trackLength * .85 && currentLapPosition < trackLength * .15;
        if (crossedFinishForward && car.lapDistance >= trackLength && car.laps < TOTAL_LAPS) {
          car.lapDistance -= trackLength;
          car.laps++;
          if (car.player) {
            const lapTime = raceTime - car.lapStart;
            car.bestLapTime = car.bestLapTime === null ? lapTime : Math.min(car.bestLapTime, lapTime);
            car.lapStart = raceTime;
            if (car.laps === TOTAL_LAPS - 1) showRaceNotification('FINAL LAP', .6);
          }
        }
        car.lastProgress = previousProgress;
        if (car.laps >= TOTAL_LAPS && !car.finished) {
          car.finished = true;
          car.finishTime = raceTime;
          car.laps = TOTAL_LAPS;
          if (car.player) endRace();
        }
      }

      function updateAI(car, dt, endless = false) {
        if (car.finished) return;
        if (car.aiBoostTimer > 0) {
          car.aiBoostTimer = Math.max(0, car.aiBoostTimer - dt);
        } else if (car.aiBoosting) {
          car.aiBoosting = false;
          car.aiBoostCooldown = 2.5 + Math.random() * 2.5;
        } else {
          car.aiBoostCooldown = Math.max(0, car.aiBoostCooldown - dt);
          if (car.aiBoostCooldown <= 0 && Math.random() < dt * .65) {
            car.aiBoosting = true;
            car.aiBoostTimer = .65 + Math.random() * .65;
          }
        }
        const variation = Math.sin(raceTime * .85 + car.skill * 10) * (4 + (1 - car.aiAccuracy) * 14);
        car.boosting = car.aiBoosting;
        const speed = car.aiSpeed * (car.aiBoosting ? 1.27 : 1) + variation;
        const step = speed * dt / trackLength;
        const old = car.progress;
        car.progress = wrapProgress(car.progress + step);
        if (old < START_PROGRESS && car.progress >= START_PROGRESS) car.laps++;
        const target = pointAt(car.progress);
        const laneWave = Math.sin(car.progress * TAU * 4 + car.skill * 6) * (5 + (1 - car.aiAccuracy) * 36);
        const miss = Math.sin(raceTime * (1.1 + car.skill) + car.skill * 17) * (1 - car.aiAccuracy) * 45;
        const side = target.angle + Math.PI / 2;
        const lane = Math.max(-ROAD_HALF + 25, Math.min(ROAD_HALF - 25, car.aiLane + laneWave + miss));
        const targetX = target.x + Math.cos(side) * lane;
        const targetY = target.y + Math.sin(side) * lane;
        const dx = targetX - car.x;
        const dy = targetY - car.y;
        const handling = 4.8 + car.aiAccuracy * 5.2;
        car.x += dx * Math.min(1, dt * handling);
        car.y += dy * Math.min(1, dt * handling);
        car.angle = target.angle + Math.sin(raceTime * 1.2 + car.skill * 8) * (1 - car.aiAccuracy) * .24;
        car.vx = Math.cos(car.angle) * speed;
        car.vy = Math.sin(car.angle) * speed;
        const previousTrackDistance = car.trackDistance;
        const nearest = nearestTrack(car.x, car.y, car.trackIndex);
        let distanceDelta = nearest.distanceAlong - previousTrackDistance;
        if (distanceDelta > trackLength / 2) distanceDelta -= trackLength;
        else if (distanceDelta < -trackLength / 2) distanceDelta += trackLength;
        car.raceTrackDistance += distanceDelta;
        car.trackDistance = nearest.distanceAlong;
        car.trackIndex = nearest.index;
        if (!endless && car.laps >= TOTAL_LAPS && !car.finished) {
          car.finished = true;
          car.finishTime = raceTime;
        }
      }

      function trackDistanceGap(from, to) {
        return to.raceTrackDistance - from.raceTrackDistance;
      }

      function currentPlace() {
        const ranking = [...racers].sort((a, b) => {
          if (a.finished && b.finished) return a.finishTime - b.finishTime;
          if (a.finished) return -1;
          if (b.finished) return 1;
          return trackDistanceGap(a, b);
        });
        return ranking.indexOf(player) + 1;
      }

      function updateHud() {
        lapDisplay.innerHTML = `${Math.min(TOTAL_LAPS, player.laps + 1)}<small> / ${TOTAL_LAPS}</small>`;
        placeDisplay.innerHTML = `${currentPlace()}<small> / ${racers.length}</small>`;
        speedDisplay.textContent = Math.round(Math.hypot(player.vx, player.vy) * .78);
        boostDisplay.style.width = `${Math.round(player.boost * 100)}%`;
        boostDisplay.style.backgroundColor = `hsl(${Math.round(player.boost / player.boostMax * 120)}, 72%, 39%)`;
        boostStatus.textContent = player.boosting
          ? 'ACTIVE'
          : player.boostRechargeDelay > 0
            ? 'RECHARGING'
            : player.boost >= player.boostMax
              ? 'READY'
              : 'REFILLING';
        boostStatus.style.color = player.boosting ? '#d46750' : '';
        boostCard.classList.toggle('boost-ready', player.boost >= player.boostMax - .001);
        document.getElementById('pause').disabled = !overlay.hidden;
      }

      function showRaceNotification(text, duration) {
        raceNotification.textContent = text;
        raceNotification.hidden = false;
        raceNotification.classList.remove('is-exiting', 'is-entering');
        void raceNotification.offsetWidth;
        raceNotification.classList.add('is-entering');
        raceNotificationTimer = duration;
      }

      function updateRaceNotification(dt) {
        if (raceNotification.hidden || raceNotificationTimer <= 0) return;
        raceNotificationTimer -= dt;
        if (raceNotificationTimer <= 0) {
          raceNotification.classList.remove('is-entering');
          raceNotification.classList.add('is-exiting');
          window.setTimeout(() => {
            if (raceNotification.classList.contains('is-exiting')) {
              raceNotification.hidden = true;
              raceNotification.classList.remove('is-exiting');
            }
          }, 250);
        }
      }

      function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = (seconds % 60).toFixed(2).padStart(5, '0');
        return `${mins}:${secs}`;
      }

      function getHallRecords() {
        let stored;
        try {
          stored = window.localStorage.getItem(HALL_STORAGE_KEY);
        } catch (error) {
          throw new Error(`Saved scores could not be accessed: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (stored === null) return [];

        let records;
        try {
          records = JSON.parse(stored);
        } catch {
          throw new Error('Saved scores are damaged. Clear this site’s local storage to start a new Hall of Fame.');
        }
        if (!Array.isArray(records) || records.some(record =>
          !record || typeof record.name !== 'string' ||
          !Number.isInteger(record.place) || record.place < 1 || record.place > 5 ||
          !Number.isFinite(record.finishTime) || record.finishTime <= 0
        )) {
          throw new Error('Saved scores have an invalid format and could not be loaded.');
        }
        return records;
      }

      function escapeHtml(value) {
        return value.replace(/[&<>"']/g, character => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]);
      }

      function renderHallOfFame() {
        const records = getHallRecords()
          .sort((a, b) => a.finishTime - b.finishTime || a.place - b.place)
          .slice(0, 5);
        const rows = records.length
          ? records.map(record => `
              <tr>
                <td>${escapeHtml(record.name)}</td>
                <td>${record.place}${record.place === 1 ? 'st' : record.place === 2 ? 'nd' : record.place === 3 ? 'rd' : 'th'}</td>
                <td>${formatTime(record.finishTime)}</td>
              </tr>`).join('')
          : '<tr><td class="hall-empty" colspan="3">No scores yet. Race to claim the first spot!</td></tr>';
        hallPanel.innerHTML = `
          <div class="hall-table-wrap">
            <table class="hall-table">
              <thead><tr><th>Player</th><th>Place</th><th>Finish time</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <div class="dialog-actions hall-actions">
            <button class="secondary-button" id="hall-back" type="button">Back</button>
          </div>`;
        document.getElementById('hall-back').addEventListener('click', showMainMenu);
        mode = 'hall';
        showOverlay('Fastest finish times', 'Hall of Fame', 'The five quickest Desk Dash finish times.', '', null, null, false, 'hall-dialog');
        hallPanel.hidden = false;
        playButton.hidden = true;
      }

      function showOverlay(eyebrow, title, copy, button, secondary = null, stats = null, showHints = false, dialogVariant = '') {
        document.getElementById('eyebrow').textContent = eyebrow;
        document.getElementById('title').innerHTML = title;
        document.getElementById('copy').textContent = copy;
        document.querySelector('.dialog').className = `dialog ${dialogVariant}`.trim();
        playButton.textContent = button;
        playButton.hidden = false;
        hallButton.hidden = true;
        hallPanel.hidden = true;
        namePanel.hidden = true;
        nameError.textContent = '';
        document.getElementById('key-hints').hidden = !showHints;
        const secondaryButton = document.getElementById('secondary-action');
        secondaryButton.hidden = !secondary;
        secondaryButton.textContent = secondary || '';
        const statsPanel = document.getElementById('result-stats');
        statsPanel.hidden = !stats;
        statsPanel.innerHTML = stats || '';
        document.getElementById('pause').disabled = true;
        overlay.hidden = false;
      }

      function resetRaceState() {
        for (const model of carMeshes.values()) {
          scene.remove(model);
          model.traverse(child => {
            if (child.isMesh) {
              child.geometry.dispose();
              if (Array.isArray(child.material)) child.material.forEach(material => material.dispose());
              else child.material.dispose();
            }
          });
        }
        carMeshes.clear();
        for (const spark of sparks) {
          scene.remove(spark.mesh);
          spark.mesh.geometry.dispose();
          spark.mesh.material.dispose();
        }
        for (const particle of smokeParticles) {
          scene.remove(particle.mesh);
          particle.mesh.geometry.dispose();
          particle.mesh.material.dispose();
        }
        racers.length = 0;
        const freshPlayer = createRacer('YOU', '#c6532d', '#c6a985', true, START_PROGRESS, 0, 0, 0);
        const freshRivals = [
          createRacer('MINT', '#46755b', '#b5c798', false, START_PROGRESS, 50, 0, .82),
          createRacer('BERRY', '#715790', '#bba9d3', false, START_PROGRESS, -50, 0, .74),
          createRacer('SUNNY', '#b58a28', '#d8c68d', false, START_PROGRESS, 100, 0, .7),
          createRacer('INK', '#46515b', '#aab8bd', false, START_PROGRESS, -100, 0, .77)
        ];
        racers.push(freshPlayer, ...freshRivals);
        Object.assign(player, freshPlayer);
        racers[0] = player;
        for (const car of racers) makeCarModel(car);
        sparks.length = 0;
        smokeParticles.length = 0;
        raceTime = 0;
        cameraShake = 0;
        cameraTargetReady = false;
      }

      function startRace() {
        resetRaceState();
        pendingResult = null;
        keys.clear();
        touches.clear();
        mode = 'countdown';
        countdownRemaining = 3.6;
        pausedMode = null;
        const countdown = document.getElementById('countdown');
        countdown.textContent = '3';
        countdown.hidden = false;
        countdown.style.animation = 'none';
        void countdown.offsetWidth;
        countdown.style.animation = '';
        overlay.hidden = true;
        updateHud();
        previousTime = performance.now();
      }

      function endRace() {
        mode = 'finishing';
        const place = currentPlace();
        const ordinal = place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`;
        const resultTitles = ['Desk Champion!', 'Silver Streak!', 'Bronze Bullet!', 'Fast Lane Ace!', 'Finish Line Hero!'];
        const title = `<span class="result-place">${ordinal}</span><span class="result-tagline">${resultTitles[place - 1] || 'Race Complete!'}</span>`;
        const copy = place === 1
          ? `You left the rivals in the dust in ${formatTime(raceTime)}. The desk is yours.`
          : `You finished ${ordinal} in ${formatTime(raceTime)}. Take another lap and go for the win!`;
        const stats = `
          <div class="result-stat"><span>Finish time</span><strong>${formatTime(raceTime)}</strong></div>
          <div class="result-stat"><span>Best lap</span><strong>${player.bestLapTime === null ? '—' : formatTime(player.bestLapTime)}</strong></div>
          <div class="result-stat"><span>Top speed</span><strong>${Math.round(player.topSpeed)} km/h</strong></div>
          <div class="result-stat"><span>Boost used</span><strong>${player.boostSpent.toFixed(1)}s</strong></div>`;
        pendingResult = { place, finishTime: raceTime, title, copy, stats };
        document.getElementById('countdown').hidden = true;
        player.aiSpeed = 232;
        for (const car of racers) {
          car.finished = false;
          car.laps %= TOTAL_LAPS;
        }
        showRaceNotification('FINISHED', 4);
        finishDisplayTimer = 4;
      }

      function presentResults() {
        mode = 'postRace';
        try {
          const records = getHallRecords().sort((a, b) => a.finishTime - b.finishTime);
          if (records.length < 5 || raceTime < records[records.length - 1].finishTime) {
            showNameEntry();
            return;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          pendingResult.copy += ` The Hall of Fame could not be checked: ${message}`;
        }
        showResults();
      }

      function showNameEntry() {
        player.aiSpeed = 232;
        mode = 'nameEntry';
        nameInput.value = '';
        showOverlay('New record!', 'YOU’RE A HALL OF FAMER!', 'Your finish time made the top five. Add your name to save it, or skip to see your race results.', '', null, null, false, 'name-dialog');
        namePanel.hidden = false;
        playButton.hidden = true;
        nameInput.focus();
      }

      function showResults() {
        if (!pendingResult) return;
        mode = 'postRace';
        const { place, title, copy, stats } = pendingResult;
        showOverlay(place === 1 ? 'A clean sweep!' : 'Race complete', title, copy, 'Try again', 'Main menu', stats, false, 'result-dialog');
      }

      function pauseRace() {
        if (mode !== 'race' && mode !== 'countdown') return;
        pausedMode = mode;
        mode = 'paused';
        keys.clear();
        touches.clear();
        document.getElementById('countdown').hidden = true;
        showOverlay('Quick pit stop', 'Race paused', 'Your rivals and the countdown are paused too. Resume whenever you are ready.', 'Resume race', 'Main menu', null, false, 'paused-dialog');
        updateHud();
      }

      function resumeRace() {
        if (mode !== 'paused') return;
        mode = pausedMode || 'race';
        pausedMode = null;
        overlay.hidden = true;
        if (mode === 'countdown') {
          document.getElementById('countdown').hidden = false;
        }
        updateHud();
        previousTime = performance.now();
      }

      function showMainMenu() {
        pendingResult = null;
        mode = 'menu';
        pausedMode = null;
        player.aiSpeed = 232;
        for (const car of racers) car.finished = false;
        document.getElementById('countdown').hidden = true;
        showOverlay(
          '',
          '<span class="menu-title"><span class="brand-mark menu-brand-mark" aria-hidden="true"><span class="brand-icon">🏁</span></span><span>DESK<br>DASH</span></span>',
          'Race the winding desk-top circuit and beat four tiny rivals across a giant office.',
          'Start your engines!',
          null,
          null,
          false,
          'menu-dialog'
        );
        hallButton.hidden = false;
        player.aiSpeed = 232;
        updateHud();
        previousTime = performance.now();
      }

      function frame(time) {
        const dt = Math.min(.035, Math.max(0, (time - previousTime) / 1000 || 0));
        previousTime = time;
        if (mode === 'countdown') {
          countdownRemaining -= dt;
          const countdown = document.getElementById('countdown');
          if (countdownRemaining <= 0) {
            mode = 'race';
            countdown.hidden = true;
          } else {
            countdown.textContent = countdownRemaining > 2.6 ? '3' :
              countdownRemaining > 1.6 ? '2' :
              countdownRemaining > .6 ? '1' : 'GO!';
          }
          updateHud();
        } else if (mode === 'menu' || mode === 'hall' || mode === 'nameEntry' || mode === 'hallError') {
          advanceBackgroundRace(dt);
        } else if (mode === 'postRace') {
          advanceBackgroundRace(dt);
        } else if (mode === 'race') {
          raceTime += dt;
          updatePlayer(dt);
          if (mode === 'race') {
            for (const car of racers) if (!car.player) updateAI(car, dt);
          }
          updateSparks(dt);
          updateSmoke(dt);
          updateHud();
          cameraShake = Math.max(0, cameraShake - dt * 12);
        } else if (mode === 'finishing') {
          advanceBackgroundRace(dt);
          finishDisplayTimer = Math.max(0, finishDisplayTimer - dt);
          if (finishDisplayTimer === 0) presentResults();
        }
        updateRaceNotification(dt);
        renderScene(dt);
        requestAnimationFrame(frame);
      }

      function advanceBackgroundRace(dt) {
        raceTime += dt;
        for (const car of racers) {
          car.finished = false;
          if (!car.player) {
            updateAI(car, dt, true);
            continue;
          }
          const previousProgress = car.progress;
          car.aiSpeed = 232;
          const step = car.aiSpeed * dt / trackLength;
          car.raceTrackDistance += step * trackLength;
          car.progress = wrapProgress(car.progress + step);
          if (previousProgress < START_PROGRESS && car.progress >= START_PROGRESS) {
            car.laps = (car.laps + 1) % TOTAL_LAPS;
          }
          const point = pointAt(car.progress);
          car.x = point.x;
          car.y = point.y;
          car.angle = point.angle;
          car.vx = Math.cos(car.angle) * car.aiSpeed;
          car.vy = Math.sin(car.angle) * car.aiSpeed;
          car.boost = Math.min(car.boostMax, car.boost + .42 * dt);
        }
        updateSparks(dt);
        updateSmoke(dt);
        updateHud();
      }

      document.addEventListener('keydown', event => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement ||
            event.target instanceof HTMLSelectElement || event.target.isContentEditable) return;
        if (event.code === 'Space') {
          event.preventDefault();
          if (!event.repeat && (mode === 'race' || mode === 'countdown')) pauseRace();
          else if (!event.repeat && mode === 'paused') resumeRace();
          return;
        }
        const control = controlKeys[event.code];
        if (control) {
          event.preventDefault();
          keys.add(control);
        }
        if (event.repeat) return;
        if (event.code === 'Enter' && (mode === 'menu' || mode === 'finished')) {
          startRace();
        }
        if (event.code === 'Escape' && mode === 'paused') {
          resumeRace();
        } else if (event.code === 'Escape' && (mode === 'race' || mode === 'countdown')) {
          pauseRace();
        }
      });

      document.addEventListener('keyup', event => {
        const control = controlKeys[event.code];
        if (control) keys.delete(control);
      });

      playButton.addEventListener('click', () => {
        if (mode === 'paused') {
          resumeRace();
        } else if (mode === 'hallError') {
          showMainMenu();
        } else if (mode === 'hall' || mode === 'nameEntry') {
          return;
        } else {
          startRace();
        }
      });

      hallButton.addEventListener('click', () => {
        try {
          renderHallOfFame();
        } catch (error) {
          mode = 'hallError';
          const message = error instanceof Error ? error.message : String(error);
          showOverlay('Unable to read saved scores', 'Hall of Fame unavailable', message, 'Back to menu');
        }
      });

      document.getElementById('add-score').addEventListener('click', () => {
        if (mode !== 'nameEntry' || !pendingResult) return;
        const name = nameInput.value.trim();
        if (!name) {
          nameError.textContent = 'Enter a name, or choose Skip to continue without saving.';
          nameInput.focus();
          return;
        }
        try {
          const records = getHallRecords();
          records.push({ name: name.slice(0, 18), place: pendingResult.place, finishTime: pendingResult.finishTime });
          records.sort((a, b) => a.finishTime - b.finishTime || a.place - b.place);
          window.localStorage.setItem(HALL_STORAGE_KEY, JSON.stringify(records.slice(0, 5)));
          showResults();
        } catch (error) {
          nameError.textContent = error instanceof Error ? error.message : String(error);
        }
      });

      document.getElementById('skip-score').addEventListener('click', showResults);
      document.getElementById('pause').addEventListener('click', pauseRace);
      document.getElementById('secondary-action').addEventListener('click', showMainMenu);

      function updateTiltSteering(event) {
        const screenAngle = window.screen.orientation
          ? window.screen.orientation.angle
          : Number(window.orientation) || 0;
        const landscape = Math.abs(screenAngle) === 90;
        const axis = landscape ? event.beta : event.gamma;
        if (typeof axis !== 'number' || !Number.isFinite(axis)) return;
        if (tiltNeutral === null) {
          tiltNeutral = axis;
          return;
        }
        const direction = landscape && screenAngle === 90 ? 1 : -1;
        tiltSteer = Math.max(-1, Math.min(1, ((axis - tiltNeutral) * direction) / 24));
      }

      async function enableTiltSteering() {
        if (tiltEnabled) return;
        const orientation = window.DeviceOrientationEvent;
        if (!orientation) {
          document.querySelector('.touch-controls').setAttribute('aria-label', 'Touch driving controls. Device tilt steering is unavailable.');
          return;
        }
        try {
          if (typeof orientation.requestPermission === 'function') {
            const permission = await orientation.requestPermission();
            if (permission !== 'granted') {
              document.querySelector('.touch-controls').setAttribute('aria-label', 'Touch driving controls. Allow motion access to steer by tilting.');
              return;
            }
          }
          window.addEventListener('deviceorientation', updateTiltSteering);
          tiltEnabled = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          document.querySelector('.touch-controls').setAttribute('aria-label', `Touch driving controls. Motion steering unavailable: ${message}`);
        }
      }

      fullscreenButton.addEventListener('click', async () => {
        try {
          if (document.fullscreenElement === document.querySelector('.game-shell')) {
            await document.exitFullscreen();
          } else if (document.querySelector('.game-shell').requestFullscreen) {
            await document.querySelector('.game-shell').requestFullscreen();
          } else {
            throw new Error('Fullscreen is not supported by this browser.');
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          fullscreenButton.title = `Fullscreen unavailable: ${message}`;
          fullscreenButton.setAttribute('aria-label', `Fullscreen unavailable: ${message}`);
        }
      });
      document.addEventListener('fullscreenchange', () => {
        const isFullscreen = document.fullscreenElement === document.querySelector('.game-shell');
        fullscreenButton.title = isFullscreen ? 'Exit fullscreen with Escape' : 'Fullscreen';
        fullscreenButton.setAttribute('aria-label', isFullscreen ? 'Fullscreen active; press Escape to exit' : 'Enter fullscreen');
      });

      portraitQuery.addEventListener('change', event => {
        if (event.matches && (mode === 'race' || mode === 'countdown')) pauseRace();
      });

      document.querySelectorAll('.touch-button').forEach(button => {
        const control = button.dataset.control;
        const down = event => {
          event.preventDefault();
          enableTiltSteering();
          touches.add(control);
          button.classList.add('active');
          if (button.setPointerCapture && event.pointerId !== undefined) button.setPointerCapture(event.pointerId);
        };
        const up = event => {
          event.preventDefault();
          touches.delete(control);
          button.classList.remove('active');
        };
        button.addEventListener('pointerdown', down);
        button.addEventListener('pointerup', up);
        button.addEventListener('pointercancel', up);
        button.addEventListener('lostpointercapture', up);
      });

      createThreeScene();
      player.aiSpeed = 232;
      requestAnimationFrame(frame);
    })();
  