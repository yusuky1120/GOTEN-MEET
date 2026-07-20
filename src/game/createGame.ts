import Phaser from 'phaser';

type RoomZone = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type RectSpec = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
  label?: string;
};

const WORLD_WIDTH = 1120;
const WORLD_HEIGHT = 760;

class HouseScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private currentRoom = '';
  private roomZones: RoomZone[] = [];

  constructor() {
    super('house');
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor('#d9d0bd');

    this.drawHouse();
    this.createPlayer();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.09, 0.09);
    this.cameras.main.setZoom(0.92);

    this.updateRoomName();
  }

  update() {
    const speed = 210;
    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown || this.wasd.A.isDown) vx -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) vx += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) vy += 1;

    const direction = new Phaser.Math.Vector2(vx, vy);
    if (direction.lengthSq() > 0) direction.normalize().scale(speed);
    this.player.setVelocity(direction.x, direction.y);

    if (vx < 0) this.player.setFlipX(true);
    if (vx > 0) this.player.setFlipX(false);

    this.updateRoomName();
  }

  private drawHouse() {
    const floor = this.add.graphics();
    floor.fillStyle(0xcbbf9f, 1);
    floor.fillRoundedRect(34, 28, WORLD_WIDTH - 68, WORLD_HEIGHT - 56, 22);

    const rooms: RectSpec[] = [
      { x: 70, y: 70, width: 250, height: 190, color: 0xd9b9ac, label: '女子部屋 A' },
      { x: 70, y: 278, width: 250, height: 300, color: 0xe1c2b8, label: '女子部屋 B' },
      { x: 338, y: 70, width: 116, height: 112, color: 0xc6d5c5, label: 'トイレ' },
      { x: 470, y: 70, width: 205, height: 112, color: 0xb9d3db, label: '風呂・洗面' },
      { x: 690, y: 70, width: 350, height: 215, color: 0xe7d2a9, label: 'キッチン' },
      { x: 690, y: 300, width: 350, height: 180, color: 0xc8d8b5, label: '男子部屋' },
      { x: 690, y: 496, width: 350, height: 180, color: 0xd8cfaa, label: '和室' },
      { x: 338, y: 198, width: 337, height: 478, color: 0xd7c49e, label: 'リビング' },
    ];

    rooms.forEach((room) => this.drawRoom(room));

    const hall = this.add.rectangle(506, 190, 720, 34, 0xb3a886).setOrigin(0.5);
    hall.setStrokeStyle(3, 0x5a5447);
    this.add.text(485, 176, '廊下', { fontFamily: 'sans-serif', fontSize: '15px', color: '#4a4439' });

    this.add.rectangle(560, 704, 180, 72, 0xc0b18e).setStrokeStyle(4, 0x514a3e);
    this.add.text(535, 690, '玄関', { fontFamily: 'sans-serif', fontSize: '18px', color: '#40392f' });

    this.add.rectangle(596, 534, 78, 210, 0x9c8b70).setStrokeStyle(4, 0x514a3e);
    for (let y = 450; y <= 610; y += 24) {
      this.add.line(0, 0, 560, y, 632, y, 0x665b4a).setOrigin(0);
    }
    this.add.text(571, 514, '階段', { fontFamily: 'sans-serif', fontSize: '15px', color: '#f4eddf' }).setAngle(90);

    this.add.rectangle(442, 390, 126, 74, 0x72584b).setStrokeStyle(3, 0x46372f);
    this.add.text(411, 377, 'テーブル', { fontFamily: 'sans-serif', fontSize: '14px', color: '#f7efe2' });
    this.add.rectangle(382, 504, 72, 154, 0x6d7d69).setStrokeStyle(3, 0x465145);
    this.add.text(361, 494, 'ソファ', { fontFamily: 'sans-serif', fontSize: '14px', color: '#f7efe2' }).setAngle(-90);
    this.add.rectangle(835, 156, 138, 52, 0x8d775e).setStrokeStyle(3, 0x514231);
    this.add.text(786, 145, 'キッチンカウンター', { fontFamily: 'sans-serif', fontSize: '13px', color: '#fff8e8' });
    this.add.rectangle(855, 585, 112, 62, 0x78624f).setStrokeStyle(3, 0x493c31);
    this.add.text(829, 575, '机', { fontFamily: 'sans-serif', fontSize: '14px', color: '#fff8e8' });

    this.roomZones = [
      { name: '女子部屋 A', x: 70, y: 70, width: 250, height: 190 },
      { name: '女子部屋 B', x: 70, y: 278, width: 250, height: 300 },
      { name: 'トイレ', x: 338, y: 70, width: 116, height: 112 },
      { name: '風呂・洗面', x: 470, y: 70, width: 205, height: 112 },
      { name: 'キッチン', x: 690, y: 70, width: 350, height: 215 },
      { name: '男子部屋', x: 690, y: 300, width: 350, height: 180 },
      { name: '和室', x: 690, y: 496, width: 350, height: 180 },
      { name: 'リビング', x: 338, y: 198, width: 337, height: 478 },
      { name: '玄関', x: 470, y: 668, width: 180, height: 72 },
      { name: '廊下', x: 146, y: 172, width: 720, height: 42 },
    ];

    const blockers = this.physics.add.staticGroup();
    const addBlocker = (x: number, y: number, width: number, height: number) => {
      const block = this.add.rectangle(x, y, width, height, 0x000000, 0);
      this.physics.add.existing(block, true);
      blockers.add(block);
    };

    addBlocker(34, WORLD_HEIGHT / 2, 22, WORLD_HEIGHT - 56);
    addBlocker(WORLD_WIDTH - 34, WORLD_HEIGHT / 2, 22, WORLD_HEIGHT - 56);
    addBlocker(WORLD_WIDTH / 2, 28, WORLD_WIDTH - 68, 22);
    addBlocker(248, WORLD_HEIGHT - 28, 428, 22);
    addBlocker(872, WORLD_HEIGHT - 28, 428, 22);
    addBlocker(596, 534, 78, 210);
    addBlocker(442, 390, 126, 74);
    addBlocker(382, 504, 72, 154);
    addBlocker(835, 156, 138, 52);
    addBlocker(855, 585, 112, 62);

    this.physics.add.collider(this.player, blockers);
  }

  private drawRoom(room: RectSpec) {
    const rect = this.add.rectangle(room.x, room.y, room.width, room.height, room.color).setOrigin(0);
    rect.setStrokeStyle(5, 0x554f43);
    if (room.label) {
      this.add.text(room.x + 14, room.y + 12, room.label, {
        fontFamily: 'sans-serif',
        fontSize: '17px',
        color: '#3e392f',
        fontStyle: 'bold',
      });
    }
  }

  private createPlayer() {
    const texture = this.textures.createCanvas('avatar', 52, 68)!;
    const ctx = texture.context;
    ctx.fillStyle = '#2f4638';
    ctx.beginPath();
    ctx.arc(26, 18, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0c8a8';
    ctx.beginPath();
    ctx.arc(26, 17, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3f6d8a';
    ctx.roundRect(11, 30, 30, 28, 9);
    ctx.fill();
    ctx.fillStyle = '#28323d';
    ctx.fillRect(14, 54, 9, 13);
    ctx.fillRect(29, 54, 9, 13);
    texture.refresh();

    this.player = this.physics.add.sprite(560, 686, 'avatar');
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(20);
    this.player.body!.setSize(28, 28);
    this.player.body!.setOffset(12, 38);
    this.add.text(560, 646, 'YOU', {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      color: '#ffffff',
      backgroundColor: '#2c332d',
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(21);
  }

  private updateRoomName() {
    const x = this.player.x;
    const y = this.player.y;
    const nextRoom = this.roomZones.find((zone) =>
      x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height,
    )?.name ?? '共用スペース';

    if (nextRoom !== this.currentRoom) {
      this.currentRoom = nextRoom;
      window.dispatchEvent(new CustomEvent('goten:room-change', { detail: nextRoom }));
    }
  }
}

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 680,
    backgroundColor: '#d9d0bd',
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
