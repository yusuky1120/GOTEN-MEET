import Phaser from 'phaser';
import {
  MIN_POSITION_DELTA,
  MOVING_POSITION_INTERVAL_MS,
  STATIONARY_HEARTBEAT_INTERVAL_MS,
} from '../realtime/playerPositionConstants';
import type { PlayerDirection } from '../realtime/playerPositionTypes';
import { ensureAllClothingTextures, ensureDefaultAvatarTextures } from './avatarTextures';
import {
  dispatchLocalPlayerPosition,
  LOCAL_PLAYER_CLOTHING_EVENT,
  type LocalPlayerClothingDetail,
} from './gamePositionEvents';
import { isTextEntryFocused } from './isTextEntryFocused';
import { clothingTextureKey } from './playerClothing';
import { RemotePlayersManager } from './remotePlayers';

type Zone = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Direction = PlayerDirection;
type SeatKind = 'chair' | 'sofa';

type Seat = {
  kind: SeatKind;
  x: number;
  y: number;
  direction: Direction;
  standX: number;
  standY: number;
};

type ColliderAdder = (x: number, y: number, width: number, height: number) => unknown;

const WORLD_WIDTH = 1040;
const WORLD_HEIGHT = 920;
const WALL = 12;
const WALL_COLOR = 0x493d30;
const MOVE_SPEED = 175;
const INTERACTION_RANGE = 68;
const PLAYER_DEPTH = 50_000;
const PLAYER_LABEL_DEPTH = 50_001;

class HouseScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private label!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private action!: Phaser.Input.Keyboard.Key;
  private cancel!: Phaser.Input.Keyboard.Key;
  private zones: Zone[] = [];
  private seats: Seat[] = [];
  private seated: Seat | null = null;
  private room = '';
  private lastStep = 0;
  private stepping = false;
  private dismissedUntil = 0;
  private facing: Direction = 'down';
  private remotePlayers: RemotePlayersManager | null = null;
  private lastPositionEmitAt = 0;
  private lastEmittedX = Number.NaN;
  private lastEmittedY = Number.NaN;
  private lastEmittedDirection: Direction = 'down';
  private lastEmittedMoving = false;
  private lastLocalMoving = false;
  private clothingVariant = 0;

  create() {
    this.cameras.main.setBackgroundColor('#252019');
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    const blockers = this.drawMap();

    // 初回アクセス時は玄関の内側から開始する。
    this.createPlayer(585, 820);
    this.physics.add.collider(this.player, blockers);
    this.player.setCollideWorldBounds(true);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D') as Record<
      'W' | 'A' | 'S' | 'D',
      Phaser.Input.Keyboard.Key
    >;
    this.action = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.cancel = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.prompt = this.add
      .text(480, 624, '', {
        fontFamily: 'sans-serif',
        fontSize: '15px',
        color: '#fffaf0',
        backgroundColor: 'rgba(28,31,25,.94)',
        padding: { x: 16, y: 10 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(60_000)
      .setVisible(false);

    this.cameras.main
      .setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
      .startFollow(this.player, true, 0.11, 0.11)
      .setZoom(1.08);

    this.remotePlayers = new RemotePlayersManager(this);
    this.remotePlayers.bind();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);
    window.addEventListener(LOCAL_PLAYER_CLOTHING_EVENT, this.onClothingChange);

    this.updateRoom();
    this.emitLocalPosition(false, performance.now(), true);
  }

  update(time: number, delta: number) {
    this.remotePlayers?.update(delta, time);

    if (isTextEntryFocused()) {
      this.player.setVelocity(0, 0);
      this.stepping = false;
      this.player.setTexture(clothingTextureKey('idle', this.clothingVariant));
      this.presentPlayer();
      this.updateRoom();
      this.emitLocalPosition(false, time);
      const forceStop = this.lastLocalMoving;
      this.lastLocalMoving = false;
      this.emitRemoteDistances(time, forceStop);
      return;
    }

    if (this.seated) {
      this.player.setVelocity(0, 0);
      if (
        Phaser.Input.Keyboard.JustDown(this.action) ||
        Phaser.Input.Keyboard.JustDown(this.cancel)
      ) {
        this.standUp();
      }
      this.presentPlayer();
      this.updateRoom();
      this.emitLocalPosition(false, time);
      const forceStop = this.lastLocalMoving;
      this.lastLocalMoving = false;
      this.emitRemoteDistances(time, forceStop);
      return;
    }

    let x = 0;
    let y = 0;
    if (this.cursors.left.isDown || this.keys.A.isDown) x -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) x += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) y -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) y += 1;

    const velocity = new Phaser.Math.Vector2(x, y);
    const moving = velocity.lengthSq() > 0;
    if (moving) velocity.normalize().scale(MOVE_SPEED);

    this.player.setVelocity(velocity.x, velocity.y);
    if (x !== 0 || y !== 0) {
      if (x < 0) this.facing = 'left';
      else if (x > 0) this.facing = 'right';
      else if (y < 0) this.facing = 'up';
      else if (y > 0) this.facing = 'down';
    }
    if (this.facing === 'left') this.player.setFlipX(true);
    if (this.facing === 'right') this.player.setFlipX(false);

    if (moving && time - this.lastStep > 170) {
      this.stepping = !this.stepping;
      this.player.setTexture(
        clothingTextureKey(this.stepping ? 'step' : 'idle', this.clothingVariant),
      );
      this.lastStep = time;
    } else if (!moving) {
      this.stepping = false;
      this.player.setTexture(clothingTextureKey('idle', this.clothingVariant));
    }

    this.updateSeatPrompt(time);
    this.presentPlayer();
    this.updateRoom();
    this.emitLocalPosition(moving, time);
    this.emitRemoteDistances(time, this.lastLocalMoving && !moving);
    this.lastLocalMoving = moving;
  }

  private emitRemoteDistances(timeMs: number, force = false): void {
    this.remotePlayers?.updateDistances(this.player.x, this.player.y, timeMs, { force });
  }

  private handleShutdown = () => {
    window.removeEventListener(LOCAL_PLAYER_CLOTHING_EVENT, this.onClothingChange);
    this.remotePlayers?.destroy();
    this.remotePlayers = null;
  };

  private readonly onClothingChange = (event: Event) => {
    const detail = (event as CustomEvent<LocalPlayerClothingDetail>).detail;
    this.clothingVariant = detail.clothingVariant;
    ensureAllClothingTextures(this);
    const pose = this.seated ? 'sit' : this.stepping ? 'step' : 'idle';
    this.player.setTexture(clothingTextureKey(pose, this.clothingVariant));
    if (this.facing === 'left') this.player.setFlipX(true);
    this.emitLocalPosition(this.lastLocalMoving, performance.now(), true);
  };

  private emitLocalPosition(moving: boolean, timeMs: number, force = false): void {
    const x = this.player.x;
    const y = this.player.y;
    const direction = this.seated ? this.seated.direction : this.facing;
    const elapsed = timeMs - this.lastPositionEmitAt;
    const movedEnough =
      !Number.isFinite(this.lastEmittedX) ||
      Math.hypot(x - this.lastEmittedX, y - this.lastEmittedY) >= MIN_POSITION_DELTA;
    const directionChanged = direction !== this.lastEmittedDirection;
    const movingChanged = moving !== this.lastEmittedMoving;
    const stoppedNow = this.lastEmittedMoving && !moving;

    let shouldEmit = force;
    if (stoppedNow || directionChanged) {
      shouldEmit = true;
    } else if (moving) {
      shouldEmit = elapsed >= MOVING_POSITION_INTERVAL_MS && (movedEnough || directionChanged);
    } else if (elapsed >= STATIONARY_HEARTBEAT_INTERVAL_MS) {
      shouldEmit = true;
    } else if (movingChanged && movedEnough) {
      shouldEmit = true;
    }

    if (!shouldEmit) return;

    this.lastPositionEmitAt = timeMs;
    this.lastEmittedX = x;
    this.lastEmittedY = y;
    this.lastEmittedDirection = direction;
    this.lastEmittedMoving = moving;

    dispatchLocalPlayerPosition({ x, y, direction, moving });
  }

  private updateSeatPrompt(time: number) {
    if (time < this.dismissedUntil) {
      this.prompt.setVisible(false);
      return;
    }

    const seat = this.nearestSeat();
    if (!seat) {
      this.prompt.setVisible(false);
      return;
    }

    const name = seat.kind === 'sofa' ? 'ソファ' : '椅子';
    this.prompt
      .setText(`${name}に座りますか？   [E] はい   [Esc] いいえ`)
      .setVisible(true);

    if (Phaser.Input.Keyboard.JustDown(this.action)) {
      this.sit(seat);
    } else if (Phaser.Input.Keyboard.JustDown(this.cancel)) {
      this.prompt.setVisible(false);
      this.dismissedUntil = time + 900;
    }
  }

  private nearestSeat() {
    let hit: Seat | null = null;
    let nearestDistance = INTERACTION_RANGE;

    for (const seat of this.seats) {
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        seat.x,
        seat.y,
      );
      if (distance < nearestDistance) {
        hit = seat;
        nearestDistance = distance;
      }
    }

    return hit;
  }

  private sit(seat: Seat) {
    this.seated = seat;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.stop();
    body.enable = false;

    this.player
      .setPosition(seat.x, seat.y - 3)
      .setTexture(clothingTextureKey('sit', this.clothingVariant))
      .setFlipX(seat.direction === 'left');
    this.facing = seat.direction;
    this.stepping = false;

    this.prompt.setText('着席中   [E] または [Esc] で立つ').setVisible(true);
    this.presentPlayer();
    this.emitLocalPosition(false, performance.now(), true);
  }

  private standUp() {
    if (!this.seated) return;

    const seat = this.seated;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.enable = true;

    this.player
      .setPosition(seat.standX, seat.standY)
      .setTexture(clothingTextureKey('idle', this.clothingVariant))
      .setFlipX(seat.direction === 'left');
    this.facing = seat.direction === 'left' || seat.direction === 'right' ? seat.direction : 'down';

    this.seated = null;
    this.prompt.setVisible(false);
    this.dismissedUntil = this.time.now + 450;
    this.presentPlayer();
    this.emitLocalPosition(false, performance.now(), true);
  }

  private presentPlayer() {
    // 家具のY座標に左右されず、プレイヤーと名前を常に最前面に表示する。
    this.shadow
      .setPosition(this.player.x, this.player.y + (this.seated ? 15 : 19))
      .setDepth(PLAYER_DEPTH - 1);
    this.player.setDepth(PLAYER_DEPTH);
    this.label
      .setPosition(this.player.x, this.player.y - (this.seated ? 35 : 39))
      .setDepth(PLAYER_LABEL_DEPTH);
  }

  private drawMap() {
    const group = this.physics.add.staticGroup();
    const addCollider: ColliderAdder = (x, y, width, height) => {
      const rectangle = this.add.rectangle(x, y, width, height, 0, 0);
      this.physics.add.existing(rectangle, true);
      group.add(rectangle);
      return rectangle;
    };

    const addWall = (x: number, y: number, width: number, height: number) => {
      this.add
        .rectangle(x, y, width, height, WALL_COLOR)
        .setStrokeStyle(2, 0x2d251d)
        .setDepth(y + height / 2);
      addCollider(x, y, width, height);
    };

    this.add
      .rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 940, 860, 0xd6c7a4)
      .setStrokeStyle(8, 0x30291f)
      .setDepth(0);

    const kitchen: Zone = { name: 'キッチン', x: 180, y: 70, width: 520, height: 170 };
    const horizontalHall: Zone = { name: '廊下', x: 120, y: 240, width: 800, height: 70 };
    const living: Zone = { name: 'リビング', x: 120, y: 310, width: 400, height: 400 };
    const verticalHall: Zone = { name: '廊下', x: 520, y: 310, width: 120, height: 400 };
    const workRoom: Zone = { name: '作業部屋', x: 640, y: 310, width: 280, height: 400 };
    const entrance: Zone = { name: '玄関', x: 420, y: 710, width: 340, height: 170 };

    this.zones = [kitchen, horizontalHall, living, verticalHall, workRoom, entrance];

    this.drawKitchenFloor(kitchen);
    this.drawWood(horizontalHall);
    this.drawMixed(living);
    this.drawWood(verticalHall);
    this.drawMixed(workRoom);
    this.drawTiles(entrance);

    this.addLabel(kitchen, 18, 14);
    this.addLabel(horizontalHall, 360, 18);
    this.addLabel(living, 18, 18);
    this.addLabel(workRoom, 18, 18);
    this.addLabel(entrance, 135, 105);

    // キッチンと横廊下。
    addWall(440, 70, 520, WALL);
    addWall(180, 155, WALL, 170);
    addWall(700, 155, WALL, 170);
    addWall(150, 240, 60, WALL);
    addWall(810, 240, 220, WALL);
    addWall(120, 275, WALL, 70);
    addWall(920, 275, WALL, 70);

    // リビング外周。右側の入口を従来より下へ移動。
    addWall(190, 310, 140, WALL);
    addWall(450, 310, 140, WALL);
    addWall(120, 510, WALL, 400);
    addWall(520, 440, WALL, 260); // y=310〜570
    addWall(520, 685, WALL, 50);  // y=660〜710

    // 作業部屋外周。左側の入口をリビングと同じ高さへ移動。
    addWall(690, 310, 100, WALL);
    addWall(875, 310, 90, WALL);
    addWall(920, 510, WALL, 400);
    addWall(640, 440, WALL, 260); // y=310〜570
    addWall(640, 685, WALL, 50);  // y=660〜710

    // 玄関とリビング・作業部屋を壁で明確に区切る。
    // 玄関へは中央の縦廊下からのみ入れる。
    addWall(320, 710, 400, WALL); // リビング下辺
    addWall(780, 710, 280, WALL); // 作業部屋下辺

    // 広げた玄関の外周。下中央のみ屋外へ開口。
    addWall(420, 795, WALL, 170);
    addWall(760, 795, WALL, 170);
    addWall(485, 880, 130, WALL);
    addWall(705, 880, 110, WALL);

    this.drawKitchen(addCollider);
    this.drawLiving(addCollider);
    this.drawWork(addCollider);
    this.drawEntrance(addCollider);

    return group;
  }

  private drawKitchen(addCollider: ColliderAdder) {
    this.add.rectangle(434, 113, 360, 52, 0x777777, 0.18).setDepth(160);
    this.add
      .rectangle(430, 108, 360, 52, 0xf3f2ee)
      .setStrokeStyle(3, 0x9a9993)
      .setDepth(161);
    this.add
      .rectangle(430, 94, 352, 20, 0xffffff)
      .setStrokeStyle(2, 0xaaa9a3)
      .setDepth(162);

    this.add
      .rectangle(360, 92, 92, 28, 0xaeb8ba)
      .setStrokeStyle(2, 0x697477)
      .setDepth(165);
    this.add.ellipse(360, 92, 48, 16, 0x7f8d90).setDepth(166);

    this.add
      .rectangle(505, 91, 92, 30, 0x323230)
      .setStrokeStyle(2, 0x171716)
      .setDepth(166);
    [-25, 25].forEach((offset) =>
      this.add.circle(505 + offset, 91, 9, 0x191918).setStrokeStyle(2, 0x65645f).setDepth(167),
    );

    [285, 370, 455, 540].forEach((x) => {
      this.add
        .rectangle(x, 124, 72, 24, 0xf2f1ed)
        .setStrokeStyle(1, 0xaaa9a3)
        .setDepth(168);
      this.add.circle(x, 124, 2, 0x77746f).setDepth(169);
    });

    this.add
      .rectangle(640, 117, 54, 92, 0xe5e7e4)
      .setStrokeStyle(3, 0x8c908d)
      .setDepth(170);
    this.add.line(0, 0, 614, 112, 666, 112, 0x8c908d, 1).setOrigin(0).setDepth(171);

    addCollider(430, 108, 360, 87);
    addCollider(640, 117, 54, 92);

    this.drawTable(430, 195, 150, 46, addCollider, 0xf4f3ef, 0xa3a19b, false);
    this.drawChair(330, 196, 'right', addCollider, 0x2f3132);
    this.drawChair(530, 196, 'left', addCollider, 0x2f3132);
  }

  private drawLiving(addCollider: ColliderAdder) {
    this.drawSofa(182, 405, 68, 86, addCollider);
    this.drawSofa(182, 510, 68, 86, addCollider);

    // 上側の濃いブラウン机を90度回転。
    this.drawTable(340, 468, 78, 132, addCollider, 0x5a3825, 0x342117, true);

    this.add
      .rectangle(488, 452, 30, 168, 0x5a4635)
      .setStrokeStyle(2, 0x33291f)
      .setDepth(540);
    this.add
      .rectangle(482, 444, 18, 120, 0x171a1c)
      .setStrokeStyle(3, 0x4b5357)
      .setDepth(541);
    this.add.rectangle(482, 444, 10, 103, 0x27343b).setDepth(542);
    this.add
      .rectangle(488, 535, 45, 24, 0x76583d)
      .setStrokeStyle(2, 0x463322)
      .setDepth(543);
    addCollider(488, 452, 42, 168);

    // 下側の白い机も90度回転し、その上に椅子を2脚並べる。
    this.drawTable(205, 655, 140, 46, addCollider, 0xf3f2ee, 0x999792, false);
    this.drawChair(175, 605, 'down', addCollider, 0x252728);
    this.drawChair(235, 605, 'down', addCollider, 0x252728);
  }

  private drawWork(addCollider: ColliderAdder) {
    this.drawTable(790, 480, 72, 190, addCollider, 0xf4f3ef, 0x999792, false);

    // 上辺は中央の1脚だけにする。
    const chairs: Array<[number, number, Direction]> = [
      [790, 350, 'down'],
      [720, 425, 'right'],
      [720, 535, 'right'],
      [860, 425, 'left'],
      [860, 535, 'left'],
      [790, 600, 'up'],
    ];
    chairs.forEach(([x, y, direction]) =>
      this.drawChair(x, y, direction, addCollider, 0x202224),
    );

    // 小型の白いPC机を右下へ寄せ、PCを天板上へ配置する。
    this.drawTable(855, 670, 100, 38, addCollider, 0xf4f3ef, 0x999792, false);
    this.drawPc(855, 645);
  }

  private drawPc(x: number, y: number) {
    this.add
      .rectangle(x, y, 52, 30, 0x25282b)
      .setStrokeStyle(3, 0x101214)
      .setDepth(y + 30);
    this.add.rectangle(x, y, 43, 21, 0x557083).setDepth(y + 31);
    this.add.rectangle(x, y + 19, 7, 11, 0x303337).setDepth(y + 32);
    this.add.rectangle(x, y + 25, 27, 5, 0x303337).setDepth(y + 32);
    this.add
      .rectangle(x - 20, y + 28, 36, 8, 0xd8d8d5)
      .setStrokeStyle(1, 0x8d8d89)
      .setDepth(y + 33);
    this.add.ellipse(x + 29, y + 28, 9, 12, 0x3d4042).setDepth(y + 33);
  }

  private drawEntrance(addCollider: ColliderAdder) {
    this.add
      .rectangle(450, 805, 42, 78, 0x71553b)
      .setStrokeStyle(3, 0x433224)
      .setDepth(820);
    this.add.line(0, 0, 431, 789, 469, 789, 0x433224, 1).setOrigin(0).setDepth(821);
    this.add.line(0, 0, 431, 813, 469, 813, 0x433224, 1).setOrigin(0).setDepth(821);
    addCollider(450, 805, 42, 78);

    this.add
      .rectangle(610, 850, 100, 34, 0x65734e)
      .setStrokeStyle(2, 0x3d482f)
      .setDepth(850);
  }

  private drawTable(
    x: number,
    y: number,
    width: number,
    height: number,
    addCollider: ColliderAdder,
    topColor: number,
    edgeColor: number,
    grain: boolean,
  ) {
    const bottom = y + height / 2;
    const highlight = Phaser.Display.Color.IntegerToColor(topColor).brighten(12).color;

    this.add
      .ellipse(x + 5, bottom + 8, width * 0.9, 18, 0x251c16, 0.18)
      .setDepth(bottom - 2);
    this.add
      .rectangle(x, y, width, height, topColor)
      .setStrokeStyle(3, edgeColor)
      .setDepth(bottom);
    this.add
      .rectangle(x, y - height / 2 + 7, width - 8, 8, highlight)
      .setDepth(bottom + 1);

    if (grain) {
      const graphics = this.add.graphics().setDepth(bottom + 2);
      graphics.lineStyle(1, edgeColor, 0.58);
      const count = Math.max(2, Math.floor(width / 28));
      for (let i = 1; i <= count; i += 1) {
        const offsetX = -width / 2 + (width * i) / (count + 1);
        graphics.lineBetween(
          x + offsetX,
          y - height / 2 + 8,
          x + offsetX + 6,
          y + height / 2 - 8,
        );
      }
    }

    this.add
      .rectangle(x - width / 2 + 13, bottom + 7, 9, 18, edgeColor)
      .setDepth(bottom - 1);
    this.add
      .rectangle(x + width / 2 - 13, bottom + 7, 9, 18, edgeColor)
      .setDepth(bottom - 1);
    addCollider(x, y, width, height);
  }

  private drawChair(
    x: number,
    y: number,
    direction: Direction,
    addCollider: ColliderAdder,
    color = 0x596b61,
  ) {
    const horizontal = direction === 'left' || direction === 'right';
    const width = horizontal ? 38 : 32;
    const height = horizontal ? 32 : 38;
    const depth = y + height / 2;
    const backColor = Phaser.Display.Color.IntegerToColor(color).darken(18).color;

    this.add
      .ellipse(x + 2, y + height / 2 - 1, width, 12, 0x241c17, 0.22)
      .setDepth(depth - 2);
    this.add
      .rectangle(x, y, width - 8, height - 10, color)
      .setStrokeStyle(2, backColor)
      .setDepth(depth);

    const offset = 13;
    if (direction === 'up') {
      this.add.rectangle(x, y + offset, width, 8, backColor).setDepth(depth + 1);
    } else if (direction === 'down') {
      this.add.rectangle(x, y - offset, width, 8, backColor).setDepth(depth + 1);
    } else if (direction === 'left') {
      this.add.rectangle(x + offset, y, 8, height, backColor).setDepth(depth + 1);
    } else {
      this.add.rectangle(x - offset, y, 8, height, backColor).setDepth(depth + 1);
    }

    addCollider(x, y, width, height);
    this.registerSeat('chair', x, y, direction, 46);
  }

  private drawSofa(
    x: number,
    y: number,
    width: number,
    height: number,
    addCollider: ColliderAdder,
  ) {
    const body = 0x805737;
    const edge = 0x4b3323;
    const cushion = 0x966a45;

    this.add
      .ellipse(x + 5, y + height / 2 + 8, width + 12, 18, 0x251c16, 0.22)
      .setDepth(y + height / 2 - 2);
    this.add
      .rectangle(x, y, width, height, body)
      .setStrokeStyle(3, edge)
      .setDepth(y + height / 2);
    this.add
      .rectangle(x - width / 2 + 9, y, 16, height - 8, edge)
      .setDepth(y + height / 2 + 1);
    this.add.rectangle(x + 6, y - 20, width - 25, 34, cushion).setDepth(y + height / 2 + 2);
    this.add.rectangle(x + 6, y + 20, width - 25, 34, cushion).setDepth(y + height / 2 + 2);
    this.add
      .line(0, 0, x - width / 2 + 16, y, x + width / 2 - 4, y, edge, 1)
      .setOrigin(0)
      .setDepth(y + height / 2 + 3);

    addCollider(x, y, width, height);
    [-20, 20].forEach((offset) =>
      this.seats.push({
        kind: 'sofa',
        x: x + 8,
        y: y + offset,
        direction: 'right',
        standX: x + width / 2 + 42,
        standY: y + offset,
      }),
    );
  }

  private registerSeat(
    kind: SeatKind,
    x: number,
    y: number,
    direction: Direction,
    distance: number,
  ) {
    const standX =
      direction === 'left' ? x + distance : direction === 'right' ? x - distance : x;
    const standY =
      direction === 'up' ? y + distance : direction === 'down' ? y - distance : y;
    this.seats.push({ kind, x, y, direction, standX, standY });
  }

  private drawKitchenFloor(zone: Zone) {
    this.add.rectangle(zone.x, zone.y, zone.width, zone.height, 0xf1f0eb).setOrigin(0).setDepth(1);
    const graphics = this.add.graphics().setDepth(2);
    graphics.lineStyle(1, 0xc9c9c3, 0.8);
    for (let x = zone.x; x <= zone.x + zone.width; x += 38) {
      graphics.lineBetween(x, zone.y, x, zone.y + zone.height);
    }
    for (let y = zone.y; y <= zone.y + zone.height; y += 38) {
      graphics.lineBetween(zone.x, y, zone.x + zone.width, y);
    }
  }

  private drawWood(zone: Zone) {
    this.add.rectangle(zone.x, zone.y, zone.width, zone.height, 0xb88d61).setOrigin(0).setDepth(1);
    const graphics = this.add.graphics().setDepth(2);
    graphics.lineStyle(1, 0x8c6544, 0.78);
    for (let y = zone.y; y <= zone.y + zone.height; y += 22) {
      graphics.lineBetween(zone.x, y, zone.x + zone.width, y);
      const shift = Math.floor((y - zone.y) / 22) % 2 ? 34 : 0;
      for (let x = zone.x + shift; x < zone.x + zone.width; x += 68) {
        graphics.lineBetween(x, y, x, Math.min(y + 22, zone.y + zone.height));
      }
    }
  }

  private drawTatami(zone: Zone) {
    this.add.rectangle(zone.x, zone.y, zone.width, zone.height, 0xd5bd83).setOrigin(0).setDepth(1);
    const graphics = this.add.graphics().setDepth(2);
    graphics.lineStyle(3, 0x7e895b, 0.78);

    const columns = zone.width < 320 ? 3 : 4;
    const rows = 3;
    const matWidth = zone.width / columns;
    const matHeight = zone.height / rows;

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = zone.x + column * matWidth;
        const y = zone.y + row * matHeight;
        graphics.strokeRect(x + 2, y + 2, matWidth - 4, matHeight - 4);
        if ((row + column) % 2 === 0) {
          graphics.lineStyle(1, 0xb69b68, 0.45);
          graphics.lineBetween(x + matWidth / 2, y + 5, x + matWidth / 2, y + matHeight - 5);
          graphics.lineStyle(3, 0x7e895b, 0.78);
        }
      }
    }
  }

  private drawMixed(zone: Zone) {
    // 畳を従来より下まで広げ、中央机と周囲の椅子を覆う。
    const tatamiHeight = Math.round(zone.height * 0.82);
    this.drawTatami({ ...zone, height: tatamiHeight });
    this.drawWood({
      ...zone,
      y: zone.y + tatamiHeight,
      height: zone.height - tatamiHeight,
    });
    this.add
      .rectangle(
        zone.x + zone.width / 2,
        zone.y + tatamiHeight,
        zone.width,
        7,
        0x7e895b,
      )
      .setDepth(3);
  }

  private drawTiles(zone: Zone) {
    this.add.rectangle(zone.x, zone.y, zone.width, zone.height, 0xc8c6bd).setOrigin(0).setDepth(1);
    const graphics = this.add.graphics().setDepth(2);
    graphics.lineStyle(1, 0xa8a69e, 0.9);
    for (let x = zone.x; x <= zone.x + zone.width; x += 35) {
      graphics.lineBetween(x, zone.y, x, zone.y + zone.height);
    }
    for (let y = zone.y; y <= zone.y + zone.height; y += 35) {
      graphics.lineBetween(zone.x, y, zone.x + zone.width, y);
    }
  }

  private addLabel(zone: Zone, offsetX: number, offsetY: number) {
    this.add
      .text(zone.x + offsetX, zone.y + offsetY, zone.name, {
        fontFamily: 'sans-serif',
        fontSize: '17px',
        color: '#30291f',
        fontStyle: 'bold',
        backgroundColor: 'rgba(245,239,220,.66)',
        padding: { x: 7, y: 4 },
      })
      .setDepth(9_000);
  }

  private createPlayer(x: number, y: number) {
    ensureDefaultAvatarTextures(this);
    ensureAllClothingTextures(this);

    this.shadow = this.add.ellipse(x, y + 19, 30, 12, 0x17130f, 0.28);
    this.player = this.physics.add.sprite(
      x,
      y,
      clothingTextureKey('idle', this.clothingVariant),
    );
    this.player.body!.setSize(22, 18);
    this.player.body!.setOffset(9, 34);
    this.label = this.add
      .text(x, y - 39, 'YOU', {
        fontFamily: 'sans-serif',
        fontSize: '11px',
        color: '#fff',
        backgroundColor: '#263229',
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5);

    this.presentPlayer();
  }

  private updateRoom() {
    const room =
      this.zones.find(
        (zone) =>
          this.player.x >= zone.x &&
          this.player.x <= zone.x + zone.width &&
          this.player.y >= zone.y &&
          this.player.y <= zone.y + zone.height,
      )?.name ?? '共用スペース';

    if (room !== this.room) {
      this.room = room;
      window.dispatchEvent(new CustomEvent('goten:room-change', { detail: room }));
    }
  }
}

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 680,
    backgroundColor: '#252019',
    pixelArt: true,
    physics: {
      default: 'arcade',
      arcade: { debug: false },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [HouseScene],
  };
}
