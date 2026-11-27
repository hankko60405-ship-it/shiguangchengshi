function createMobileCurl({ surface, canvas, isActive, isBlocked, getPage, setPage, getImage, pageCount }) {
  const context = canvas.getContext('2d');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  let gesture;
  let animation;
  let frame = 0;
  let suppressClick = false;

  function drawPage(image, width, height, mirrored) {
    context.save();
    if (mirrored) {
      context.translate(width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(image, 0, 0, width, height);
    context.restore();
  }

  function paint(turn) {
    const { currentImage, nextImage, progress, direction, tilt, anchorY, width, height, scale } = turn;
    if (!context || reducedMotion.matches || !currentImage.naturalWidth || !nextImage.naturalWidth) return;
    context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    drawPage(nextImage, width, height, false);
    context.save();

    const mirrored = direction < 0;
    if (mirrored) {
      context.translate(width, 0);
      context.scale(-1, 1);
    }

    // A diagonal coordinate follows the fold. Project narrow strips around a
    // cylinder, then draw the returning side over the face of the sheet.
    const slant = Math.abs(tilt) * height;
    const bend = width + slant - (width * 1.13 + slant * 2) * progress;
    const radius = width * (.014 + .105 * Math.sin(Math.PI * progress));
    const foldEnd = bend + Math.PI * radius;
    const start = -slant;
    const end = width + slant;
    const overlap = .55 / scale;
    const shadow = context.createLinearGradient(bend, 0, bend + radius * 2.3, 0);
    shadow.addColorStop(0, 'rgba(21, 24, 21, .23)');
    shadow.addColorStop(1, 'rgba(21, 24, 21, 0)');
    context.save();
    context.transform(1, 0, -tilt, 1, tilt * anchorY, 0);
    context.fillStyle = shadow;
    context.fillRect(bend, 0, radius * 2.3, height);
    context.restore();

    function strip(from, to, slope, offset, angle) {
      if (to <= from || Math.abs(slope) < .001) return;
      context.save();
      const shear = (slope - 1) * tilt;
      context.transform(slope, 0, shear, 1, offset - shear * anchorY, 0);
      const top = tilt * anchorY;
      const bottom = -tilt * (height - anchorY);
      context.beginPath();
      context.moveTo(from + top - overlap, 0);
      context.lineTo(to + top + overlap, 0);
      context.lineTo(to + bottom + overlap, height);
      context.lineTo(from + bottom - overlap, height);
      context.closePath();
      context.clip();
      drawPage(currentImage, width, height, mirrored);
      if (slope < 0) {
        const opacity = .70 + .18 * Math.sin(angle);
        context.fillStyle = `rgba(241, 238, 226, ${opacity})`;
        context.fillRect(0, 0, width, height);
      } else if (angle > 0) {
        context.fillStyle = `rgba(24, 32, 27, ${.25 * Math.sin(angle)})`;
        context.fillRect(0, 0, width, height);
      }
      context.restore();
    }

    strip(start, Math.min(bend, end), 1, 0, 0);
    const stripCount = 24;
    for (let index = 0; index < stripCount; index += 1) {
      const angleStart = Math.PI * index / stripCount;
      const angleEnd = Math.PI * (index + 1) / stripCount;
      const from = bend + radius * angleStart;
      const to = bend + radius * angleEnd;
      const projectedStart = bend + radius * Math.sin(angleStart);
      const slope = radius * (Math.sin(angleEnd) - Math.sin(angleStart)) / (to - from);
      strip(Math.max(start, from), Math.min(end, to), slope, projectedStart - slope * from, (angleStart + angleEnd) / 2);
    }
    strip(Math.max(start, foldEnd), end, -1, bend + foldEnd, Math.PI);
    context.restore();
    canvas.classList.add('is-drawing');
  }

  function makeTurn(direction, bounds, anchorY = bounds.height * .77) {
    const page = getPage();
    const nextPage = page + direction;
    if (nextPage < 1 || nextPage > pageCount) return;
    const scale = Math.min(devicePixelRatio || 1, 1.5);
    if (context && !reducedMotion.matches) {
      canvas.width = Math.max(1, Math.round(bounds.width * scale));
      canvas.height = Math.max(1, Math.round(bounds.height * scale));
    }
    return {
      currentImage: getImage(page),
      nextImage: getImage(nextPage),
      nextPage,
      direction,
      width: bounds.width,
      height: bounds.height,
      anchorY,
      scale,
      progress: 0,
      tilt: .20 * (1 - 2 * anchorY / bounds.height)
    };
  }

  function clearTurn() {
    cancelAnimationFrame(frame);
    frame = 0;
    gesture = undefined;
    animation = undefined;
    canvas.classList.remove('is-drawing');
  }

  function settle(turn, complete) {
    cancelAnimationFrame(frame);
    const target = complete ? 1 : 0;
    const from = turn.progress;
    if (!context || reducedMotion.matches || Math.abs(target - from) < .01) {
      if (complete) setPage(turn.nextPage);
      clearTurn();
      return;
    }

    const start = performance.now();
    const duration = 140 + Math.abs(target - from) * (complete ? 230 : 145);
    animation = turn;
    function step(now) {
      const elapsed = clamp((now - start) / duration, 0, 1);
      turn.progress = from + (target - from) * (1 - (1 - elapsed) ** 3);
      if (elapsed < 1) {
        paint(turn);
        frame = requestAnimationFrame(step);
      } else {
        if (complete) setPage(turn.nextPage);
        clearTurn();
      }
    }
    frame = requestAnimationFrame(step);
  }

  function updateGesture(event) {
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.turn) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      suppressClick = true;
      const direction = dx < 0 ? 1 : -1;
      gesture.turn = makeTurn(direction, gesture.bounds, gesture.y - gesture.bounds.top);
      if (!gesture.turn) return;
      surface.setPointerCapture(event.pointerId);
    }
    const turn = gesture.turn;
    const distance = -dx * turn.direction;
    turn.progress = clamp(distance / (turn.width * .88), 0, .98);
    turn.tilt = clamp(.20 * (1 - 2 * turn.anchorY / turn.height) + dy / turn.height * .65, -.32, .32);
    gesture.distance = distance;
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        paint(turn);
      });
    }
  }

  surface.addEventListener('pointerdown', event => {
    if (!isActive() || !event.isPrimary || event.button !== 0) return;
    suppressClick = Boolean(animation);
    if (animation || isBlocked()) return;
    gesture = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start: event.timeStamp,
      bounds: canvas.getBoundingClientRect()
    };
  });
  surface.addEventListener('pointermove', event => {
    if (gesture?.pointer === event.pointerId) updateGesture(event);
  });

  function endGesture(event, cancelled) {
    if (gesture?.pointer !== event.pointerId) return;
    if (!cancelled) updateGesture(event);
    const { turn, distance, start } = gesture;
    gesture = undefined;
    if (!turn) return;
    const quickSwipe = distance > 34 && distance / Math.max(event.timeStamp - start, 1) > .48;
    const complete = !cancelled && (distance >= turn.width * .27 || quickSwipe);
    settle(turn, complete);
  }

  surface.addEventListener('pointerup', event => endGesture(event, false));
  surface.addEventListener('pointercancel', event => endGesture(event, true));
  surface.addEventListener('lostpointercapture', event => endGesture(event, true));
  window.addEventListener('pointerup', event => endGesture(event, true));
  surface.addEventListener('click', event => {
    if ((suppressClick || animation) && event.detail !== 0) {
      event.stopImmediatePropagation();
    }
    suppressClick = false;
  }, true);

  return {
    turn(direction) {
      if (gesture || animation || isBlocked()) return;
      const turn = makeTurn(direction, canvas.getBoundingClientRect());
      if (turn) settle(turn, true);
    },
    cancel: clearTurn
  };
}
