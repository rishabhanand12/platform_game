const scale = 40;
const wobbleSpeed = 8;
const wobbleDist = 0.07;
const playerXSpeed = 7;
const gravity = 30;
const jumpSpeed = 15;
const arrowKeys = trackKeys(["ArrowLeft", "ArrowRight", "ArrowUp"]);

class Level {
  constructor(plan) {
    let rows = plan
      .trim()
      .split("\n")
      .map((elem) => [...elem]);
    this.height = rows.length;
    this.width = rows[0].length;
    this.startActors = [];
    this.rows = rows.map((row, y) => {
      return row.map((elem, x) => {
        let type = levelChars[elem];
        if (typeof type === "string") {
          return type;
        } else {
          this.startActors.push(type.create(new Vec(x, y), elem));
          return "empty";
        }
      });
    });
  }
}

class Vec {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  plus(other) {
    return new Vec(this.x + other.x, this.y + other.y);
  }
  times(factor) {
    return new Vec(this.x * factor, this.y * factor);
  }
}

class Player {
  constructor(pos, speed, direction) {
    this.pos = pos;
    this.speed = speed;
    this.direction = direction;
  }

  get type() {
    return "player";
  }

  static create(pos) {
    return new Player(pos.plus(new Vec(0, -0.5)), new Vec(0, 0), "forward");
  }
}
Player.prototype.size = new Vec(1.5, 0.8);
Player.prototype.update = function (time, state, keys) {
  let xSpeed = 0;
  var direction = this.direction;
  if (keys.ArrowLeft) {
    direction = "backward";
    xSpeed -= playerXSpeed;
  }
  if (keys.ArrowRight) {
    direction = "forward";
    xSpeed += playerXSpeed;
  }
  let pos = this.pos;
  let movedX = pos.plus(new Vec(xSpeed * time, 0));
  if (!state.level.touches(movedX, this.size, "wall")) {
    pos = movedX;
  }
  let ySpeed = this.speed.y + time * gravity;
  let movedY = pos.plus(new Vec(0, ySpeed * time));
  if (!state.level.touches(movedY, this.size, "wall")) {
    pos = movedY;
  } else if (keys.ArrowUp && ySpeed > 0) {
    ySpeed = -jumpSpeed;
  } else {
    ySpeed = 0;
  }
  return new Player(pos, new Vec(xSpeed, ySpeed), direction);
};

class Coin {
  constructor(pos, basePos, wobble) {
    this.pos = pos;
    this.basePos = basePos;
    this.wobble = wobble;
  }
  get type() {
    return "coin";
  }
  static create(pos) {
    let basePos = pos.plus(new Vec(0.2, 0.1));
    return new Coin(basePos, basePos, Math.random() * Math.PI * 2);
  }
}
Coin.prototype.size = new Vec(0.6, 0.6);
Coin.prototype.collide = function (state) {
  let filtered = state.actors.filter((a) => a != this);
  let status = state.status;
  if (!filtered.some((a) => a.type == "coin")) status = "won";
  return new State(state.level, filtered, status);
};

Coin.prototype.update = function (time) {
  let wobble = this.wobble + time * wobbleSpeed;
  let wobblePos = Math.sin(wobble) * wobbleDist;
  return new Coin(
    this.basePos.plus(new Vec(0, wobblePos)),
    this.basePos,
    wobble
  );
};

class Lava {
  constructor(pos, speed, action, reset) {
    this.pos = pos;
    this.speed = speed;
    this.reset = reset;
    this.action = action;
  }
  get type() {
    return "lava";
  }
  static create(pos, ch) {
    if (ch == "=") {
      return new Lava(pos, new Vec(2, 0), "horizontal");
    } else if (ch == "|") {
      return new Lava(pos, new Vec(0, 2), "vertical");
    } else if (ch == "v") {
      return new Lava(pos, new Vec(0, 3), "trickle", pos);
    }
  }
}
Lava.prototype.size = new Vec(0.8, 0.8);
Level.prototype.touches = function (pos, size, type) {
  var xStart = Math.floor(pos.x);
  var xEnd = Math.ceil(pos.x + size.x);
  var yStart = Math.floor(pos.y);
  var yEnd = Math.ceil(pos.y + size.y);

  for (var y = yStart; y < yEnd; y++) {
    for (var x = xStart; x < xEnd; x++) {
      let isOutside = x < 0 || x >= this.width || y < 0 || y >= this.height;
      let here = isOutside ? "wall" : this.rows[y][x];
      if (here == type) return true;
    }
  }
  return false;
};
Lava.prototype.collide = function (state) {
  return new State(state.level, state.actors, "lost");
};

Lava.prototype.update = function (time, state, action) {
  let newPos = this.pos.plus(this.speed.times(time));
  if (!state.level.touches(newPos, this.size, "wall")) {
    return new Lava(newPos, this.speed, action, this.reset);
  } else if (this.reset) {
    return new Lava(this.reset, this.speed, action, this.reset);
  } else {
    return new Lava(this.pos, this.speed.times(-1), action);
  }
};

//DOM

function createElement(tag, attributes, ...children) {
  let element = document.createElement(tag);
  for (let attr of Object.keys(attributes)) {
    element.setAttribute(attr, attributes[attr]);
  }
  for (let child of children) {
    element.appendChild(child);
  }
  return element;
}

class DOMDisplay {
  constructor(parent, level) {
    this.dom = createElement(
      "div",
      { class: "game" },
      drawGridFromLevel(level)
    );
    this.actorLayer = null;
    parent.append(this.dom);
  }
  clear() {
    this.dom.remove();
  }
}

DOMDisplay.prototype.syncState = function (state) {
  let grid = document.querySelector(".background");
  if (this.actorLayer) this.actorLayer.remove();
  this.actorLayer = drawActors(state.actors);
  //   console.log(this.actorLayer);
  grid.append(this.actorLayer);
  this.dom.class = `game ${state.status}`;
  this.scrollPlayerIntoView(state);
};

DOMDisplay.prototype.scrollPlayerIntoView = function (state) {
  let width = this.dom.clientWidth;
  let height = this.dom.clientHeight;
  let margin = width / 3;
  let left = this.dom.scrollLeft;
  let right = left + width;
  let top = this.dom.scrollTop,
    bottom = top + height;

  let player = state.player;
  let center = player.pos.plus(player.size.times(0.5)).times(scale);

  if (center.x < left + margin) {
    this.dom.scrollLeft = center.x - margin;
  } else if (center.x > right - margin) {
    this.dom.scrollLeft = center.x + margin - width;
  }
  if (center.y < top + margin) {
    this.dom.scrollTop = center.y - margin;
  } else if (center.y > bottom - margin) {
    this.dom.scrollTop = center.y + margin - height;
  }
};

class State {
  constructor(level, actors, status) {
    this.level = level;
    this.actors = actors;
    this.status = status;
  }
  static start(level) {
    return new State(level, level.startActors, "playing");
  }
  get player() {
    return this.actors.find((a) => a.type === "player");
  }
}

State.prototype.update = function (time, keys) {
  let actors = this.actors.map((actor) => {
    if (actor.type === "lava") {
      return actor.update(time, this, actor.action);
    }
    return actor.update(time, this, keys);
  });
  let newState = new State(this.level, actors, this.status);
  // console.log(newState);
  if (newState.status != "playing") return newState;

  let player = newState.player;
  if (this.level.touches(player.pos, player.size, "lava")) {
    return new State(this.level, actors, "lost");
  }

  for (let actor of actors) {
    if (actor != player && overlap(actor, player)) {
      newState = actor.collide(newState);
    }
  }
  return newState;
};

function drawGridFromLevel(level) {
  return createElement(
    "table",
    { class: "background", style: `width: ${level.width * scale}px` }, //Scale is 20,
    ...level.rows.map((row) =>
      createElement(
        "tr",
        { style: `height: ${scale}px` },
        ...row.map((elem) => createElement("td", { class: elem }))
      )
    )
  );
}

function drawActors(actors) {
  return createElement(
    "div",
    { class: "actor-layer" },
    ...actors.map((actor) => {
      var rect;
      if (actor.type == "lava") {
        rect = createElement("div", {
          class: `actor ${actor.type} ${actor.action}`,
        });
      } else if (actor.type == "player") {
        rect = createElement("div", {
          class: `actor ${actor.type} ${actor.direction}`,
        });
      } else {
        rect = createElement("div", { class: `actor ${actor.type}` });
      }
      rect.style.width = `${actor.size.x * scale}px`;
      rect.style.height = `${actor.size.y * scale}px`;
      rect.style.left = `${actor.pos.x * scale}px`;
      rect.style.top = `${actor.pos.y * scale}px`;
      return rect;
    })
  );
}

function overlap(actor1, actor2) {
  return (
    actor1.pos.x + actor1.size.x > actor2.pos.x &&
    actor1.pos.x < actor2.pos.x + actor2.size.x &&
    actor1.pos.y + actor1.size.y > actor2.pos.y &&
    actor1.pos.y < actor2.pos.y + actor2.size.y
  );
}

function trackKeys(keys) {
  let down = Object.create(null);
  function track(event) {
    if (keys.includes(event.key)) {
      down[event.key] = event.type == "keydown";
      event.preventDefault();
    }
  }
  window.addEventListener("keydown", track);
  window.addEventListener("keyup", track);
  return down;
}

// Why is this function used?
function runAnimation(frameFunc) {
  let lastTime = null;
  function frame(time) {
    if (lastTime != null) {
      let timeStep = Math.min(time - lastTime, 100) / 1000;
      if (frameFunc(timeStep) === false) return;
    }
    lastTime = time;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function runLevel(level, Display) {
  let display = new Display(document.body, level); //grid created and appended to DOM
  console.log(display, level);
  let state = State.start(level);
  let ending = 1; // why is it used?
  return new Promise((resolve) => {
    runAnimation((time) => {
      state = state.update(time, arrowKeys); //state updates such as actor updates
      display.syncState(state); //actors drawn here and added to actor layer
      if (state.status == "playing") {
        return true;
      } else if (ending > 0) {
        ending -= time;
        return true;
      } else {
        display.clear();
        resolve(state.status);
        return false;
      }
    });
  });
}

async function runGame(plans, Display) {
  for (let level = 0; level < plans.length; ) {
    let status = await runLevel(new Level(plans[level]), Display); //runlevel called with new level object
    if (status == "won") {
      level++;
    } else if (status == "lost") {
      console.log("lost");
    }
  }
  console.log("You've won!");
}

const plans = [
  `................................
.################################
.#..............................#
.#..............................#
.#..............................#
.#...........................o..#
.#..@...........................#
.##########..............########
..........#..o..o..o..o..#.......
..........#..............#.......
..........################.......
.................................`,
  `................................................................................
................................................................................
....###############################.............................................
...##.............................##########################################....
...#.......................................................................##...
...#....o...................................................................#...
...#................................................=.......................#...
...#.o........################...................o..o...........|........o..#...
...#.........................#..............................................#...
...#....o....................##########.....###################....##########...
...#..................................#+++++#.................#....#............
...###############....oo......=o.o.o..#######.###############.#....#............
.....#...............o..o.............#.......#......#........#....#............
.....#....................#############..######.####.#.########....########.....
.....#.............########..............#...........#.#..................#.....
.....#..........####......####...#####################.#..................#.....
.....#........###............###.......................########....########.....
.....#.......##................#########################......#....#............
.....#.......#................................................#....#............
.....###......................................................#....#............
.......#...............o...........................................#............
.......#...............................................o...........#............
.......#########......###.....############.........................##...........
.............#..................#........#####....#######.o.........########....
.............#++++++++++++++++++#............#....#.....#..................#....
.............#++++++++++++++++++#..........###....###...####.o.............#....
.............####################..........#........#......#.....|.........#....
...........................................#++++++++#......####............#....
...........................................#++++++++#.........#........@...#....
...........................................#++++++++#.........##############....
...........................................##########...........................
................................................................................`,
  `......................................#++#........................#######....................................#+#..
......................................#++#.....................####.....####.................................#+#..
......................................#++##########...........##...........##................................#+#..
......................................##++++++++++##.........##.............##...............................#+#..
.......................................##########++#.........#....................................o...o...o..#+#..
................................................##+#.........#.....o...o....................................##+#..
.................................................#+#.........#................................###############++#..
.................................................#v#.........#.....#...#........................++++++++++++++##..
.............................................................##..|...|...|..##............#####################...
..............................................................##+++++++++++##............v........................
...............................................................####+++++####......................................
...............................................#.....#............#######........###.........###..................
...............................................#.....#...........................#.#.........#.#..................
...............................................#.....#.............................#.........#....................
...............................................#.....#.............................##........#....................
...............................................##....#.............................#.........#....................
...............................................#.....#......o..o.....#...#.........#.........#....................
...............#######........###...###........#.....#...............#...#.........#.........#....................
..............##.....##.........#...#..........#.....#.....######....#...#...#########.......#....................
.............##.......##........#.o.#..........#....##...............#...#...#...............#....................
.....@.......#.........#........#...#..........#.....#...............#...#...#...............#....................
....###......#.........#........#...#..........#.....#...............#...#####...######......#....................
....#.#......#.........#.......##.o.##.........#.....#...............#.....o.....#.#.........#....................
++++#.#++++++#.........#++++++##.....##++++++++##....#++++++++++.....#.....=.....#.#.........#....................
++++#.#++++++#.........#+++++##.......##########.....#+++++++##+.....#############.##..o.o..##....................
++++#.#++++++#.........#+++++#....o.................##++++++##.+....................##.....##.....................
++++#.#++++++#.........#+++++#.....................##++++++##..+.....................#######......................
++++#.#++++++#.........#+++++##.......##############++++++##...+..................................................
++++#.#++++++#.........#++++++#########++++++++++++++++++##....+..................................................
++++#.#++++++#.........#++++++++++++++++++++++++++++++++##.....+..................................................`,
  `..............................................................................................................
..............................................................................................................
..............................................................................................................
..............................................................................................................
..............................................................................................................
........................................o.....................................................................
..............................................................................................................
........................................#.....................................................................
........................................#.....................................................................
........................................#.....................................................................
........................................#.....................................................................
.......................................###....................................................................
.......................................#.#.................+++........+++..###................................
.......................................#.#.................+#+........+#+.....................................
.....................................###.###................#..........#......................................
......................................#...#.................#...oooo...#.......###............................
......................................#...#.................#..........#......#+++#...........................
......................................#...#.................############.......###............................
.....................................##...##......#...#......#................................................
......................................#...#########...########..............#.#...............................
......................................#...#...........#....................#+++#..............................
......................................#...#...........#.....................###...............................
.....................................##...##..........#.......................................................
......................................#...#=.=.=.=....#............###........................................
......................................#...#...........#...........#+++#.......................................
......................................#...#....=.=.=.=#.....o......###.......###..............................
.....................................##...##..........#.....................#+++#.............................
..............................o...o...#...#...........#.....#................##v........###...................
......................................#...#...........#..............#.................#+++#..................
.............................###.###.###.###.....o.o..#++++++++++++++#...................v#...................
.............................#.###.#.#.###.#..........#++++++++++++++#........................................
.............................#.............#...#######################........................................
.............................##...........##.........................................###......................
..###.........................#.....#.....#.........................................#+++#................###..
..#.#.........................#....###....#..........................................###.................#.#..
..#...........................#....###....#######........................#####.............................#..
..#...........................#...........#..............................#...#.............................#..
..#...........................##..........#..............................#.#.#.............................#..
..#.......................................#.......|####|....|####|.....###.###.............................#..
..#................###.............o.o....#..............................#.........###.....................#..
..#...............#####.......##..........#.............................###.......#+++#..........#.........#..
..#...............o###o.......#....###....#.............................#.#........###..........###........#..
..#................###........#############..#.oo.#....#.oo.#....#.oo..##.##....................###........#..
..#......@..........#.........#...........#++#....#++++#....#++++#....##...##....................#.........#..
..#############################...........#############################.....################################..
..............................................................................................................
..............................................................................................................`,
  `..................................................................................................###.#.......
......................................................................................................#.......
..................................................................................................#####.......
..................................................................................................#...........
..................................................................................................#.###.......
..........................o.......................................................................#.#.#.......
.............................................................................................o.o.o###.#.......
...................###................................................................................#.......
.......+..o..+................................................#####.#####.#####.#####.#####.#####.#####.......
.......#.....#................................................#...#.#...#.#...#.#...#.#...#.#...#.#...........
.......#=.o..#............#...................................###.#.###.#.###.#.###.#.###.#.###.#.#####.......
.......#.....#..................................................#.#...#.#...#.#...#.#...#.#...#.#.....#.......
.......+..o..+............o..................................####.#####.#####.#####.#####.#####.#######.......
..............................................................................................................
..........o..............###..............................##..................................................
..............................................................................................................
..............................................................................................................
......................................................##......................................................
...................###.........###............................................................................
..............................................................................................................
..........................o.....................................................#......#......................
..........................................................##.....##...........................................
.............###.........###.........###.................................#..................#.................
..............................................................................................................
.................................................................||...........................................
..###########.................................................................................................
..#.........#.o.#########.o.#########.o.##................................................#...................
..#.........#...#.......#...#.......#...#.................||..................#.....#.........................
..#..@......#####...o...#####...o...#####.....................................................................
..#######.....................................#####.......##.....##.....###...................................
........#=..................=................=#...#.....................###...................................
........#######################################...#+++++++++++++++++++++###+++++++++++++++++++++++++++++++++++
..................................................############################################################
..............................................................................................................`,
];

const levelChars = {
  ".": "empty",
  "#": "wall",
  "+": "lava",
  "@": Player,
  o: Coin,
  "=": Lava,
  "|": Lava,
  v: Lava,
};

runGame(plans, DOMDisplay);
