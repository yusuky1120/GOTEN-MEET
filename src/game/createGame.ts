import Phaser from 'phaser';
import { HOUSE_MAP_DATA_URI } from './houseMapData';

type RoomZone = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const WORLD_WIDTH = 1200;
const WORLD_HEIGHT = 900;

class HouseScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerLabel!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private currentRoom = '';

  private readonly roomZones: RoomZone[] = [
    { name: '女子部屋 A', x: 25, y: 25, width: 235, height: 270 },
    { name: '女子部屋 B', x: 25, y: 340, width: 305, height: 390 },
    { name: 'トイレ', x: 260, y: 25, width: 105, height: 235 },
    { name: 'お風呂', x: 365, y: 25, width: 125, height: 235 },
    { name: '洗面所', x: 490, y: 25, width: 135, height: 235 },
    { name: 'キッチン', x: 625, y: 25, width: 280, height: 250 },
    { name: '男子部屋', x: 910, y: 25, width: 265, height: 285 },
    { name: '作業部屋', x: 905, y: 335, width: 270, height: 360 },
    { name: 'リビング', x: 350, y: 340, width: 370, height: 390 },
    { name: '階段', x: 735, y: 340, width: 140, height: 365 },
    { name: '玄関', x: 685, y: 695, width: 230, height: 185 },
    { name: '廊下', x: 250, y: 260, width: 660, height: 90 },
  ];

  constructor() {
    super('house');
  }

  preload() {
    this.load.image('house-map', HOUSE_MAP_DATA_URI);
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor('#252019');

    this.add
      .image(0, 0, 'house-map')
      .setOrigin(0)
      .setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT)
      .setDepth(0);

    this.createPlayer();
    this.createPrototypeCollisions();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<
      'W' | 'A' | 'S' | 'D',
      Phaser.Input.Keyboard.Key
    >;

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.09, 0.09);
    this.cameras.main.setZoom(0.9);

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

    this.playerLabel.setPosition(this.player.x, this.player.y - 45);
    this.updateRoomName();
  }

  private createPrototypeCollisions() {
    const blockers = this.physics.add.staticGroup();

    const addBlocker = (x: number, y: number, width: number, height: number) => {
      const block = this.add.rectangle(x, y, width, height, 0x000000, 0);
      this.physics.add.existing(block, true);
      blockers.add(block);
    };

    // 現段階では大きな家具と階段だけを仮の障害物として扱う。
    addBlocker(525, 525, 95, 120); // リビングのテーブル
    addBlocker(385, 520, 55, 190); // ソファ
    addBlocker(690, 520, 45, 175); // TV / 棚
    addBlocker(805, 520, 120, 320); // 階段
    addBlocker(1015, 500, 125, 95); // 作業机
    addBlocker(755, 150, 125, 85); // キッチンテーブル

    this.physics.add.collider(this.player, blockers);
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

    this.player = this.physics.add.sprite(800, 825, 'avatar');
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(20);
    this.player.body!.setSize(28, 28);
    this.player.body!.setOffset(12, 38);

    this.playerLabel = this.add
      .text(this.player.x, this.player.y - 45, 'YOU', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#ffffff',
        backgroundColor: '#2c332d',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(21);
  }

  private updateRoomName() {
    const x = this.player.x;
    const y = this.player.y;
    const nextRoom =
      this.roomZones.find(
        (zone) =>
          x >= zone.x &&
          x <= zone.x + zone.width &&
          y >= zone.y &&
          y <= zone.y + zone.height,
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
