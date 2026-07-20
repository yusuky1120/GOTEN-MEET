import Phaser from 'phaser';

type RoomZone = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type RoomSpec = RoomZone & {
  color: number;
};

const WORLD_WIDTH = 1040;
const WORLD_HEIGHT = 860;
const WALL_COLOR = 0x4b4032;
const WALL_THICKNESS = 12;

class HouseScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerLabel!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private roomZones: RoomZone[] = [];
  private currentRoom = '';

  constructor() {
    super('house');
  }

  create() {
    this.cameras.main.setBackgroundColor('#252019');
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    const blockers = this.drawHouse();
    this.createPlayer(580, 770);
    this.physics.add.collider(this.player, blockers);
    this.player.setCollideWorldBounds(true);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<
      'W' | 'A' | 'S' | 'D',
      Phaser.Input.Keyboard.Key
    >;

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(0.95);

    this.updateRoomName();
  }

  update() {
    const speed = 175;
    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown || this.wasd.A.isDown) vx -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) vx += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) vy += 1;

    const velocity = new Phaser.Math.Vector2(vx, vy);
    if (velocity.lengthSq() > 0) velocity.normalize().scale(speed);

    this.player.setVelocity(velocity.x, velocity.y);

    if (vx < 0) this.player.setFlipX(true);
    if (vx > 0) this.player.setFlipX(false);

    this.playerLabel.setPosition(this.player.x, this.player.y - 38);
    this.updateRoomName();
  }

  private drawHouse(): Phaser.Physics.Arcade.StaticGroup {
    const blockers = this.physics.add.staticGroup();

    const kitchen: RoomSpec = {
      name: 'キッチン',
      x: 180,
      y: 70,
      width: 520,
      height: 170,
      color: 0xeeeae0,
    };
    const horizontalHall: RoomSpec = {
      name: '廊下',
      x: 120,
      y: 240,
      width: 800,
      height: 70,
      color: 0xb5966c,
    };
    const living: RoomSpec = {
      name: 'リビング',
      x: 120,
      y: 310,
      width: 400,
      height: 400,
      color: 0xaeb27a,
    };
    const verticalHall: RoomSpec = {
      name: '廊下',
      x: 520,
      y: 310,
      width: 120,
      height: 400,
      color: 0xb5966c,
    };
    const workRoom: RoomSpec = {
      name: '作業部屋',
      x: 640,
      y: 310,
      width: 280,
      height: 400,
      color: 0xbcc89b,
    };
    const entrance: RoomSpec = {
      name: '玄関',
      x: 440,
      y: 710,
      width: 280,
      height: 110,
      color: 0xc8c6bd,
    };

    this.roomZones = [kitchen, living, workRoom, entrance, horizontalHall, verticalHall];

    this.add
      .rectangle(520, 430, 940, 800, 0xd5c6a3)
      .setStrokeStyle(8, 0x30291f)
      .setDepth(0);

    this.drawPlainRoom(kitchen);
    this.drawWoodFloor(horizontalHall);
    this.drawLivingRoom(living);
    this.drawWoodFloor(verticalHall);
    this.drawTatamiRoom(workRoom);
    this.drawTileRoom(entrance);

    this.addRoomLabel(kitchen, 18, 14);
    this.addRoomLabel(horizontalHall, 360, 18);
    this.addRoomLabel(living, 18, 18);
    this.addRoomLabel(workRoom, 18, 18);
    this.addRoomLabel(entrance, 112, 70);

    const addWall = (x: number, y: number, width: number, height: number) => {
      const wall = this.add.rectangle(x, y, width, height, WALL_COLOR).setDepth(8);
      this.physics.add.existing(wall, true);
      blockers.add(wall);
      return wall;
    };

    const addFurniture = (
      x: number,
      y: number,
      width: number,
      height: number,
      color: number,
      label?: string,
    ) => {
      const furniture = this.add
        .rectangle(x, y, width, height, color)
        .setStrokeStyle(3, 0x4b3525)
        .setDepth(6);
      this.physics.add.existing(furniture, true);
      blockers.add(furniture);

      if (label) {
        this.add
          .text(x, y, label, {
            fontFamily: 'sans-serif',
            fontSize: '14px',
            color: '#f7f0e2',
            fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setDepth(7);
      }
    };

    // キッチン外周。下側中央は廊下へ広く開けて、敷居を置かない。
    addWall(440, 70, 520, WALL_THICKNESS);
    addWall(180, 155, WALL_THICKNESS, 170);
    addWall(700, 155, WALL_THICKNESS, 170);
    addWall(285, 240, 210, WALL_THICKNESS);
    addWall(595, 240, 210, WALL_THICKNESS);

    // 横廊下の外周。
    addWall(150, 240, 60, WALL_THICKNESS);
    addWall(810, 240, 220, WALL_THICKNESS);
    addWall(120, 275, WALL_THICKNESS, 70);
    addWall(920, 275, WALL_THICKNESS, 70);

    // リビング上側。中央を廊下への入口として開ける。
    addWall(190, 310, 140, WALL_THICKNESS);
    addWall(450, 310, 140, WALL_THICKNESS);
    addWall(120, 510, WALL_THICKNESS, 400);

    // リビング右側。中央下寄りを縦廊下への入口として開ける。
    addWall(520, 405, WALL_THICKNESS, 190);
    addWall(520, 650, WALL_THICKNESS, 120);

    // リビング下側。右下は玄関へ直接つながる。
    addWall(280, 710, 320, WALL_THICKNESS);

    // 作業部屋上側。中央付近を横廊下への入口として開ける。
    addWall(690, 310, 100, WALL_THICKNESS);
    addWall(875, 310, 90, WALL_THICKNESS);
    addWall(920, 510, WALL_THICKNESS, 400);

    // 作業部屋左側。縦廊下への入口を確保する。
    addWall(640, 375, WALL_THICKNESS, 130);
    addWall(640, 615, WALL_THICKNESS, 190);

    // 作業部屋下側。左下は玄関へつながる。
    addWall(820, 710, 200, WALL_THICKNESS);

    // 玄関外周。上は廊下・両部屋へ、下中央は屋外へ開ける。
    addWall(440, 765, WALL_THICKNESS, 110);
    addWall(720, 765, WALL_THICKNESS, 110);
    addWall(495, 820, 110, WALL_THICKNESS);
    addWall(665, 820, 110, WALL_THICKNESS);

    // キッチン家具。
    addFurniture(440, 110, 380, 54, 0x8a6a4a, 'キッチンカウンター');
    addFurniture(440, 190, 170, 45, 0x765238, 'テーブル');
    addFurniture(335, 205, 34, 34, 0x69745e);
    addFurniture(545, 205, 34, 34, 0x69745e);

    // リビング家具。上2/3が畳、下1/3が木床。
    addFurniture(180, 460, 58, 185, 0x61765f, 'ソファ');
    addFurniture(330, 470, 125, 82, 0x775238, 'テーブル');
    addFurniture(485, 455, 28, 180, 0x493f35, 'TV');
    addFurniture(345, 655, 140, 44, 0x7b5637, '机');

    // 作業部屋の机は縦長。
    addFurniture(842, 500, 58, 210, 0x785236, '作業机');
    addFurniture(765, 500, 48, 58, 0x586a61, '椅子');
    addFurniture(680, 610, 42, 125, 0x67513e, '棚');

    // 玄関の下駄箱。
    addFurniture(472, 765, 34, 72, 0x70543a, '靴箱');

    return blockers;
  }

  private drawPlainRoom(room: RoomSpec) {
    this.add
      .rectangle(room.x, room.y, room.width, room.height, room.color)
      .setOrigin(0)
      .setDepth(1);

    const grid = this.add.graphics().setDepth(2);
    grid.lineStyle(1, 0xc9c5bb, 0.7);
    for (let x = room.x; x <= room.x + room.width; x += 40) {
      grid.lineBetween(x, room.y, x, room.y + room.height);
    }
    for (let y = room.y; y <= room.y + room.height; y += 40) {
      grid.lineBetween(room.x, y, room.x + room.width, y);
    }
  }

  private drawWoodFloor(room: RoomSpec) {
    this.add
      .rectangle(room.x, room.y, room.width, room.height, room.color)
      .setOrigin(0)
      .setDepth(1);

    const lines = this.add.graphics().setDepth(2);
    lines.lineStyle(1, 0x866746, 0.7);
    for (let y = room.y + 18; y < room.y + room.height; y += 18) {
      lines.lineBetween(room.x, y, room.x + room.width, y);
    }
    for (let x = room.x + 70; x < room.x + room.width; x += 95) {
      lines.lineBetween(x, room.y, x, room.y + room.height);
    }
  }

  private drawLivingRoom(room: RoomSpec) {
    const tatamiHeight = Math.round(room.height * 0.66);

    this.add
      .rectangle(room.x, room.y, room.width, tatamiHeight, 0xaeb27a)
      .setOrigin(0)
      .setDepth(1);
    this.add
      .rectangle(room.x, room.y + tatamiHeight, room.width, room.height - tatamiHeight, 0xa77d52)
      .setOrigin(0)
      .setDepth(1);

    const tatami = this.add.graphics().setDepth(2);
    tatami.lineStyle(2, 0x7d8355, 0.7);
    const cellWidth = room.width / 4;
    const cellHeight = tatamiHeight / 3;
    for (let column = 1; column < 4; column += 1) {
      tatami.lineBetween(
        room.x + column * cellWidth,
        room.y,
        room.x + column * cellWidth,
        room.y + tatamiHeight,
      );
    }
    for (let row = 1; row < 3; row += 1) {
      tatami.lineBetween(
        room.x,
        room.y + row * cellHeight,
        room.x + room.width,
        room.y + row * cellHeight,
      );
    }

    const wood = this.add.graphics().setDepth(2);
    wood.lineStyle(1, 0x7d593c, 0.7);
    for (let y = room.y + tatamiHeight + 20; y < room.y + room.height; y += 20) {
      wood.lineBetween(room.x, y, room.x + room.width, y);
    }
  }

  private drawTatamiRoom(room: RoomSpec) {
    this.add
      .rectangle(room.x, room.y, room.width, room.height, room.color)
      .setOrigin(0)
      .setDepth(1);

    const grid = this.add.graphics().setDepth(2);
    grid.lineStyle(2, 0x87916b, 0.75);
    const cellWidth = room.width / 2;
    const cellHeight = room.height / 4;
    grid.lineBetween(room.x + cellWidth, room.y, room.x + cellWidth, room.y + room.height);
    for (let row = 1; row < 4; row += 1) {
      grid.lineBetween(
        room.x,
        room.y + row * cellHeight,
        room.x + room.width,
        room.y + row * cellHeight,
      );
    }
  }

  private drawTileRoom(room: RoomSpec) {
    this.add
      .rectangle(room.x, room.y, room.width, room.height, room.color)
      .setOrigin(0)
      .setDepth(1);

    const grid = this.add.graphics().setDepth(2);
    grid.lineStyle(1, 0xa5a39d, 0.8);
    for (let x = room.x; x <= room.x + room.width; x += 32) {
      grid.lineBetween(x, room.y, x, room.y + room.height);
    }
    for (let y = room.y; y <= room.y + room.height; y += 32) {
      grid.lineBetween(room.x, y, room.x + room.width, y);
    }
  }

  private addRoomLabel(room: RoomSpec, offsetX: number, offsetY: number) {
    this.add
      .text(room.x + offsetX, room.y + offsetY, room.name, {
        fontFamily: 'sans-serif',
        fontSize: room.name === '玄関' ? '20px' : '18px',
        color: '#3f392f',
        fontStyle: 'bold',
      })
      .setDepth(5);
  }

  private createPlayer(x: number, y: number) {
    const texture = this.textures.createCanvas('avatar', 40, 52)!;
    const context = texture.context;

    context.fillStyle = '#273e32';
    context.beginPath();
    context.arc(20, 13, 11, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = '#efc4a2';
    context.beginPath();
    context.arc(20, 13, 8, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = '#3f6d8a';
    context.roundRect(8, 24, 24, 21, 7);
    context.fill();

    context.fillStyle = '#26313b';
    context.fillRect(10, 42, 7, 10);
    context.fillRect(23, 42, 7, 10);
    texture.refresh();

    this.player = this.physics.add.sprite(x, y, 'avatar');
    this.player.setDepth(20);
    this.player.body!.setSize(22, 18);
    this.player.body!.setOffset(9, 31);

    this.playerLabel = this.add
      .text(x, y - 38, 'YOU', {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#2c332d',
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(21);
  }

  private updateRoomName() {
    const nextRoom =
      this.roomZones.find(
        (zone) =>
          this.player.x >= zone.x &&
          this.player.x <= zone.x + zone.width &&
          this.player.y >= zone.y &&
          this.player.y <= zone.y + zone.height,
      )?.name ?? 'マップ外';

    if (nextRoom === this.currentRoom) return;

    this.currentRoom = nextRoom;
    window.dispatchEvent(new CustomEvent('goten:room-change', { detail: nextRoom }));
  }
}

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 680,
    backgroundColor: '#252019',
    pixelArt: false,
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
