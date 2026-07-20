import Phaser from 'phaser';

type Zone = { name: string; x: number; y: number; w: number; h: number };
const W = 1120;
const H = 760;

class HouseScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private label!: Phaser.GameObjects.Text;
  private currentRoom = '';
  private zones: Zone[] = [];

  create() {
    this.physics.world.setBounds(0, 0, W, H);
    this.drawMap();
    this.createPlayer();
    this.createCollisions();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    this.cameras.main.setBounds(0, 0, W, H).startFollow(this.player, true, 0.09, 0.09).setZoom(0.92);
    this.updateRoom();
  }

  update() {
    let x = 0;
    let y = 0;
    if (this.cursors.left.isDown || this.keys.A.isDown) x--;
    if (this.cursors.right.isDown || this.keys.D.isDown) x++;
    if (this.cursors.up.isDown || this.keys.W.isDown) y--;
    if (this.cursors.down.isDown || this.keys.S.isDown) y++;

    const velocity = new Phaser.Math.Vector2(x, y);
    if (velocity.lengthSq()) velocity.normalize().scale(210);
    this.player.setVelocity(velocity.x, velocity.y);
    if (x) this.player.setFlipX(x < 0);
    this.label.setPosition(this.player.x, this.player.y - 45);
    this.updateRoom();
  }

  private drawMap() {
    this.cameras.main.setBackgroundColor('#d9d0bd');
    const shell = this.add.rectangle(W / 2, H / 2, W - 60, H - 50, 0xcbbf9f).setStrokeStyle(8, 0x514b40);
    shell.setDepth(-2);

    const rooms = [
      [70, 70, 250, 190, 0xd9b9ac, '女子部屋 A'],
      [70, 278, 250, 300, 0xe1c2b8, '女子部屋 B'],
      [338, 70, 116, 112, 0xc6d5c5, 'トイレ'],
      [470, 70, 205, 112, 0xb9d3db, '風呂・洗面'],
      [690, 70, 350, 215, 0xe7d2a9, 'キッチン'],
      [690, 300, 350, 180, 0xc8d8b5, '男子部屋'],
      [690, 496, 350, 180, 0xd8cfaa, '和室'],
      [338, 198, 337, 478, 0xd7c49e, 'リビング'],
    ] as const;

    rooms.forEach(([x, y, w, h, color, name]) => {
      this.add.rectangle(x, y, w, h, color).setOrigin(0).setStrokeStyle(5, 0x554f43);
      this.add.text(x + 13, y + 11, name, { fontFamily: 'sans-serif', fontSize: '17px', color: '#3e392f', fontStyle: 'bold' });
      this.zones.push({ name, x, y, w, h });
    });

    this.add.rectangle(506, 190, 720, 34, 0xb3a886).setStrokeStyle(3, 0x5a5447);
    this.add.text(485, 176, '廊下', { fontFamily: 'sans-serif', fontSize: '15px', color: '#4a4439' });
    this.zones.push({ name: '廊下', x: 146, y: 172, w: 720, h: 42 });

    this.add.rectangle(560, 704, 180, 72, 0xc0b18e).setStrokeStyle(4, 0x514a3e);
    this.add.text(535, 690, '玄関', { fontFamily: 'sans-serif', fontSize: '18px', color: '#40392f' });
    this.zones.push({ name: '玄関', x: 470, y: 668, w: 180, h: 72 });

    this.furniture(596, 534, 78, 210, 0x9c8b70, '階段');
    this.furniture(442, 390, 126, 74, 0x72584b, 'テーブル');
    this.furniture(382, 504, 72, 154, 0x6d7d69, 'ソファ');
    this.furniture(835, 156, 138, 52, 0x8d775e, 'カウンター');
    this.furniture(855, 585, 112, 62, 0x78624f, '机');
  }

  private furniture(x: number, y: number, w: number, h: number, color: number, name: string) {
    this.add.rectangle(x, y, w, h, color).setStrokeStyle(3, 0x493c31);
    this.add.text(x, y, name, { fontFamily: 'sans-serif', fontSize: '13px', color: '#fff8e8' }).setOrigin(0.5);
  }

  private createPlayer() {
    const texture = this.textures.createCanvas('avatar', 52, 68)!;
    const c = texture.context;
    c.fillStyle = '#2f4638'; c.beginPath(); c.arc(26, 18, 14, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#f0c8a8'; c.beginPath(); c.arc(26, 17, 10, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3f6d8a'; c.roundRect(11, 30, 30, 28, 9); c.fill();
    c.fillStyle = '#28323d'; c.fillRect(14, 54, 9, 13); c.fillRect(29, 54, 9, 13);
    texture.refresh();

    this.player = this.physics.add.sprite(560, 686, 'avatar').setDepth(20).setCollideWorldBounds(true);
    this.player.body!.setSize(28, 28);
    this.player.body!.setOffset(12, 38);
    this.label = this.add.text(560, 640, 'YOU', { fontFamily: 'sans-serif', fontSize: '13px', color: '#fff', backgroundColor: '#2c332d', padding: { x: 6, y: 3 } }).setOrigin(0.5).setDepth(21);
  }

  private createCollisions() {
    const group = this.physics.add.staticGroup();
    const block = (x: number, y: number, w: number, h: number) => {
      const rect = this.add.rectangle(x, y, w, h, 0, 0);
      this.physics.add.existing(rect, true);
      group.add(rect);
    };
    block(30, H / 2, 20, H - 50); block(W - 30, H / 2, 20, H - 50); block(W / 2, 25, W - 60, 20);
    block(245, H - 25, 430, 20); block(875, H - 25, 430, 20);
    block(596, 534, 78, 210); block(442, 390, 126, 74); block(382, 504, 72, 154); block(835, 156, 138, 52); block(855, 585, 112, 62);
    this.physics.add.collider(this.player, group);
  }

  private updateRoom() {
    const room = this.zones.find((z) => this.player.x >= z.x && this.player.x <= z.x + z.w && this.player.y >= z.y && this.player.y <= z.y + z.h)?.name ?? '共用スペース';
    if (room !== this.currentRoom) {
      this.currentRoom = room;
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
    physics: { default: 'arcade', arcade: { debug: false } },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [HouseScene],
  };
}
