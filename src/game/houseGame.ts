import Phaser from 'phaser';

type Zone = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const WORLD_WIDTH = 1040;
const WORLD_HEIGHT = 860;
const WALL = 12;
const WALL_COLOR = 0x4b4032;

class HouseScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerLabel!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private zones: Zone[] = [];
  private currentRoom = '';

  create() {
    this.cameras.main.setBackgroundColor('#252019');
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    const blockers = this.drawMap();
    this.createPlayer(580, 770);
    this.physics.add.collider(this.player, blockers);
    this.player.setCollideWorldBounds(true);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D') as Record<
      'W' | 'A' | 'S' | 'D',
      Phaser.Input.Keyboard.Key
    >;

    this.cameras.main
      .setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
      .startFollow(this.player, true, 0.1, 0.1)
      .setZoom(0.95);

    this.updateRoom();
  }

  update() {
    let x = 0;
    let y = 0;

    if (this.cursors.left.isDown || this.keys.A.isDown) x -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) x += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) y -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) y += 1;

    const velocity = new Phaser.Math.Vector2(x, y);
    if (velocity.lengthSq() > 0) velocity.normalize().scale(175);

    this.player.setVelocity(velocity.x, velocity.y);
    if (x < 0) this.player.setFlipX(true);
    if (x > 0) this.player.setFlipX(false);

    this.playerLabel.setPosition(this.player.x, this.player.y - 38);
    this.updateRoom();
  }

  private drawMap() {
    const blockers = this.physics.add.staticGroup();

    const addStaticRect = (
      x: number,
      y: number,
      width: number,
      height: number,
      color: number,
      alpha = 1,
      depth = 8,
    ) => {
      const rect = this.add.rectangle(x, y, width, height, color, alpha).setDepth(depth);
      this.physics.add.existing(rect, true);
      blockers.add(rect);
      return rect;
    };

    const addWall = (x: number, y: number, width: number, height: number) =>
      addStaticRect(x, y, width, height, WALL_COLOR);

    const addFurniture = (
      x: number,
      y: number,
      width: number,
      height: number,
      color: number,
      label: string,
    ) => {
      const item = addStaticRect(x, y, width, height, color, 1, 6).setStrokeStyle(3, 0x4b3525);
      this.add
        .text(x, y, label, {
          fontFamily: 'sans-serif',
          fontSize: '14px',
          color: '#f7f0e2',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(7);
      return item;
    };

    this.add
      .rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 940, 800, 0xd5c6a3)
      .setStrokeStyle(8, 0x30291f)
      .setDepth(0);

    const kitchen = { name: 'キッチン', x: 180, y: 70, width: 520, height: 170 };
    const horizontalHall = { name: '廊下', x: 120, y: 240, width: 800, height: 70 };
    const living = { name: 'リビング', x: 120, y: 310, width: 400, height: 400 };
    const verticalHall = { name: '廊下', x: 520, y: 310, width: 120, height: 400 };
    const workRoom = { name: '作業部屋', x: 640, y: 310, width: 280, height: 400 };
    const entrance = { name: '玄関', x: 440, y: 710, width: 280, height: 110 };

    this.zones = [kitchen, horizontalHall, living, verticalHall, workRoom, entrance];

    this.drawKitchen(kitchen);
    this.drawWoodArea(horizontalHall);
    this.drawLiving(living);
    this.drawWoodArea(verticalHall);
    this.drawTatamiArea(workRoom);
    this.drawTileArea(entrance);

    this.addLabel(kitchen, 18, 14);
    this.addLabel(horizontalHall, 360, 18);
    this.addLabel(living, 18, 18);
    this.addLabel(workRoom, 18, 18);
    this.addLabel(entrance, 112, 68);

    // キッチン外周。下中央を廊下へ開口。
    addWall(440, 70, 520, WALL);
    addWall(180, 155, WALL, 170);
    addWall(700, 155, WALL, 170);
    addWall(285, 240, 210, WALL);
    addWall(595, 240, 210, WALL);

    // 横廊下外周。
    addWall(150, 240, 60, WALL);
    addWall(810, 240, 220, WALL);
    addWall(120, 275, WALL, 70);
    addWall(920, 275, WALL, 70);

    // リビング。上中央を横廊下へ、右中央を縦廊下へ、右下を玄関へ開口。
    addWall(190, 310, 140, WALL);
    addWall(450, 310, 140, WALL);
    addWall(120, 510, WALL, 400);
    addWall(520, 405, WALL, 190);
    addWall(520, 650, WALL, 120);
    addWall(280, 710, 320, WALL);

    // 作業部屋。上を横廊下へ、左中央を縦廊下へ、左下を玄関へ開口。
    addWall(690, 310, 100, WALL);
    addWall(875, 310, 90, WALL);
    addWall(920, 510, WALL, 400);
    addWall(640, 375, WALL, 130);
    addWall(640, 615, WALL, 190);
    addWall(820, 710, 200, WALL);

    // 玄関。上側でリビング・廊下・作業部屋へ接続、下中央を外へ開口。
    addWall(440, 765, WALL, 110);
    addWall(720, 765, WALL, 110);
    addWall(495, 820, 110, WALL);
    addWall(665, 820, 110, WALL);

    // 家具。
    addFurniture(440, 110, 380, 54, 0x8a6a4a, 'キッチンカウンター');
    addFurniture(440, 190, 170, 45, 0x765238, 'テーブル');
    addFurniture(180, 460, 58, 185, 0x61765f, 'ソファ');
    addFurniture(330, 470, 125, 82, 0x775238, 'テーブル');
    addFurniture(485, 455, 28, 180, 0x493f35, 'TV');
    addFurniture(345, 655, 140, 44, 0x7b5637, '机');
    addFurniture(842, 500, 58, 210, 0x785236, '作業机');
    addFurniture(765, 500, 48, 58, 0x586a61, '椅子');
    addFurniture(680, 610, 42, 125, 0x67513e, '棚');
    addFurniture(472, 765, 34, 72, 0x70543a, '靴箱');

    return blockers;
  }

  private drawKitchen(zone: Zone) {
    this.add.rectangle(zone.x, zone.y, zone.width, zone.height, 0xeeeae0).setOrigin(0).setDepth(1);
    const grid = this.add.graphics().setDepth(2);
    grid.lineStyle(1, 0xc9c5bb, 0.7);
    for (let x = zone.x; x <= zone.x + zone.width; x += 40) {
      grid.lineBetween(x, zone.y, x, zone.y + zone.height);
    }
    for (let y = zone.y; y <= zone.y + zone.height; y += 40) {
      grid.lineBetween(zone.x, y, zone.x + zone.width, y);
    }
  }

  private drawWoodArea(zone: Zone) {
    this.add.rectangle(zone.x, zone.y, zone.width, zone.height, 0xb5966c).setOrigin(0).setDepth(1);
    const lines = this.add.graphics().setDepth(2);
    lines.lineStyle(1, 0x8a6c4d, 0.7);
    for (let y = zone.y; y <= zone.y + zone.height; y += 24) {
      lines.lineBetween(zone.x, y, zone.x + zone.width, y);
    }
  }

  private drawTatamiArea(zone: Zone) {
    this.add.rectangle(zone.x, zone.y, zone.width, zone.height, 0xbcc89b).setOrigin(0).setDepth(1);
    const grid = this.add.graphics().setDepth(2);
    grid.lineStyle(2, 0x8f9d70, 0.75);
    for (let x = zone.x; x <= zone.x + zone.width; x += 70) {
      grid.lineBetween(x, zone.y, x, zone.y + zone.height);
    }
    for (let y = zone.y; y <= zone.y + zone.height; y += 100) {
      grid.lineBetween(zone.x, y, zone.x + zone.width, y);
    }
  }

  private drawLiving(zone: Zone) {
    const tatamiHeight = Math.round(zone.height * 0.66);
    this.drawTatamiArea({ ...zone, height: tatamiHeight });
    this.drawWoodArea({
      ...zone,
      y: zone.y + tatamiHeight,
      height: zone.height - tatamiHeight,
    });
  }

  private drawTileArea(zone: Zone) {
    this.add.rectangle(zone.x, zone.y, zone.width, zone.height, 0xc8c6bd).setOrigin(0).setDepth(1);
    const grid = this.add.graphics().setDepth(2);
    grid.lineStyle(1, 0xa8a69e, 0.9);
    for (let x = zone.x; x <= zone.x + zone.width; x += 35) {
      grid.lineBetween(x, zone.y, x, zone.y + zone.height);
    }
    for (let y = zone.y; y <= zone.y + zone.height; y += 35) {
      grid.lineBetween(zone.x, y, zone.x + zone.width, y);
    }
  }

  private addLabel(zone: Zone, offsetX: number, offsetY: number) {
    this.add
      .text(zone.x + offsetX, zone.y + offsetY, zone.name, {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#312b23',
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

    this.player = this.physics.add.sprite(x, y, 'avatar').setDepth(20);
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

  private updateRoom() {
    const room =
      this.zones.find(
        (zone) =>
          this.player.x >= zone.x &&
          this.player.x <= zone.x + zone.width &&
          this.player.y >= zone.y &&
          this.player.y <= zone.y + zone.height,
      )?.name ?? '共用スペース';

    if (room === this.currentRoom) return;

    this.currentRoom = room;
    window.dispatchEvent(new CustomEvent('goten:room-change', { detail: room }));
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
