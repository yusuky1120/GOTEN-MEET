import Phaser from 'phaser';

type Zone = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type ChairDirection = 'up' | 'down' | 'left' | 'right';

const WORLD_WIDTH = 1040;
const WORLD_HEIGHT = 860;
const WALL = 12;
const WALL_COLOR = 0x493d30;

class HouseScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private playerLabel!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private zones: Zone[] = [];
  private currentRoom = '';
  private lastStepAt = 0;
  private stepFrame = false;

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

  update(time: number) {
    let x = 0;
    let y = 0;

    if (this.cursors.left.isDown || this.keys.A.isDown) x -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) x += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) y -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) y += 1;

    const velocity = new Phaser.Math.Vector2(x, y);
    const isMoving = velocity.lengthSq() > 0;
    if (isMoving) velocity.normalize().scale(175);

    this.player.setVelocity(velocity.x, velocity.y);
    if (x < 0) this.player.setFlipX(true);
    if (x > 0) this.player.setFlipX(false);

    if (isMoving && time - this.lastStepAt > 170) {
      this.stepFrame = !this.stepFrame;
      this.player.setTexture(this.stepFrame ? 'avatar-step' : 'avatar-idle');
      this.lastStepAt = time;
    } else if (!isMoving) {
      this.stepFrame = false;
      this.player.setTexture('avatar-idle');
    }

    this.playerShadow.setPosition(this.player.x, this.player.y + 19);
    this.playerShadow.setDepth(this.player.y - 2);
    this.player.setDepth(this.player.y + 20);
    this.playerLabel.setPosition(this.player.x, this.player.y - 39);
    this.updateRoom();
  }

  private drawMap() {
    const blockers = this.physics.add.staticGroup();

    const addCollider = (x: number, y: number, width: number, height: number) => {
      const collider = this.add.rectangle(x, y, width, height, 0x000000, 0);
      this.physics.add.existing(collider, true);
      blockers.add(collider);
      return collider;
    };

    const addWall = (x: number, y: number, width: number, height: number) => {
      this.add
        .rectangle(x, y, width, height, WALL_COLOR)
        .setStrokeStyle(2, 0x2d251d)
        .setDepth(y + height / 2);
      addCollider(x, y, width, height);
    };

    this.add
      .rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 940, 800, 0xd6c7a4)
      .setStrokeStyle(8, 0x30291f)
      .setDepth(0);

    const kitchen: Zone = { name: 'キッチン', x: 180, y: 70, width: 520, height: 170 };
    const horizontalHall: Zone = { name: '廊下', x: 120, y: 240, width: 800, height: 70 };
    const living: Zone = { name: 'リビング', x: 120, y: 310, width: 400, height: 400 };
    const verticalHall: Zone = { name: '廊下', x: 520, y: 310, width: 120, height: 400 };
    const workRoom: Zone = { name: '作業部屋', x: 640, y: 310, width: 280, height: 400 };
    const entrance: Zone = { name: '玄関', x: 440, y: 710, width: 280, height: 110 };

    this.zones = [kitchen, horizontalHall, living, verticalHall, workRoom, entrance];

    this.drawKitchenFloor(kitchen);
    this.drawWoodArea(horizontalHall);
    this.drawMixedRoom(living);
    this.drawWoodArea(verticalHall);
    this.drawMixedRoom(workRoom);
    this.drawTileArea(entrance);

    this.addLabel(kitchen, 18, 14);
    this.addLabel(horizontalHall, 360, 18);
    this.addLabel(living, 18, 18);
    this.addLabel(workRoom, 18, 18);
    this.addLabel(entrance, 112, 68);

    // キッチン外周。下中央は廊下へ広く開いている。
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

    // リビング。上中央、右中央、右下に開口を確保。
    addWall(190, 310, 140, WALL);
    addWall(450, 310, 140, WALL);
    addWall(120, 510, WALL, 400);
    addWall(520, 405, WALL, 190);
    addWall(520, 650, WALL, 120);
    addWall(280, 710, 320, WALL);

    // 作業部屋。上、左中央、左下に開口を確保。
    addWall(690, 310, 100, WALL);
    addWall(875, 310, 90, WALL);
    addWall(920, 510, WALL, 400);
    addWall(640, 375, WALL, 130);
    addWall(640, 615, WALL, 190);
    addWall(820, 710, 200, WALL);

    // 玄関外周。下中央は屋外への出入口。
    addWall(440, 765, WALL, 110);
    addWall(720, 765, WALL, 110);
    addWall(495, 820, 110, WALL);
    addWall(665, 820, 110, WALL);

    this.drawKitchenObjects(addCollider);
    this.drawLivingObjects(addCollider);
    this.drawWorkRoomObjects(addCollider);
    this.drawEntranceObjects(addCollider);

    return blockers;
  }

  private drawKitchenObjects(
    addCollider: (x: number, y: number, width: number, height: number) => unknown,
  ) {
    // 壁付けキッチンカウンター。
    const counterX = 430;
    const counterY = 108;
    const counterWidth = 360;
    const counterHeight = 52;

    this.add
      .rectangle(counterX + 4, counterY + 5, counterWidth, counterHeight, 0x3c2c22, 0.3)
      .setDepth(counterY + counterHeight);
    this.add
      .rectangle(counterX, counterY, counterWidth, counterHeight, 0x896643)
      .setStrokeStyle(3, 0x4a3425)
      .setDepth(counterY + counterHeight + 1);
    this.add
      .rectangle(counterX, counterY - 14, counterWidth - 8, 20, 0xd8d0c3)
      .setStrokeStyle(2, 0x857b70)
      .setDepth(counterY + counterHeight + 2);

    // シンク、コンロ、収納扉。
    this.add
      .rectangle(360, 92, 92, 28, 0xaeb8ba)
      .setStrokeStyle(2, 0x697477)
      .setDepth(165);
    this.add.ellipse(360, 92, 48, 16, 0x7f8d90).setDepth(166);
    this.add.rectangle(505, 91, 92, 30, 0x323230).setStrokeStyle(2, 0x171716).setDepth(166);
    for (const dx of [-25, 25]) {
      this.add.circle(505 + dx, 91, 9, 0x191918).setStrokeStyle(2, 0x65645f).setDepth(167);
    }
    for (const x of [285, 370, 455, 540]) {
      this.add.rectangle(x, 124, 72, 24, 0x765537).setStrokeStyle(1, 0x4c3525).setDepth(168);
      this.add.circle(x, 124, 2, 0xd6b476).setDepth(169);
    }

    // 冷蔵庫。
    this.add.rectangle(640, 117, 54, 92, 0xc8cbc7).setStrokeStyle(3, 0x777b78).setDepth(170);
    this.add.line(0, 0, 614, 112, 666, 112, 0x777b78, 1).setOrigin(0).setDepth(171);
    this.add.rectangle(649, 95, 3, 20, 0x6c706c).setDepth(172);
    this.add.rectangle(649, 135, 3, 28, 0x6c706c).setDepth(172);

    addCollider(counterX, counterY, counterWidth, counterHeight + 35);
    addCollider(640, 117, 54, 92);

    // 小さなダイニングテーブルと椅子。
    this.drawWoodTable(430, 195, 150, 46, addCollider);
    this.drawChair(330, 196, 'right', addCollider);
    this.drawChair(530, 196, 'left', addCollider);
  }

  private drawLivingObjects(
    addCollider: (x: number, y: number, width: number, height: number) => unknown,
  ) {
    // ソファ。背もたれ・座面・肘掛けを分けて描く。
    const sofaX = 180;
    const sofaY = 455;
    this.add.ellipse(sofaX + 4, sofaY + 78, 82, 34, 0x2e241e, 0.25).setDepth(500);
    this.add
      .rectangle(sofaX, sofaY, 68, 188, 0x4f694f)
      .setStrokeStyle(3, 0x304330)
      .setDepth(sofaY + 95);
    this.add.rectangle(sofaX - 19, sofaY, 18, 174, 0x3e593e).setDepth(sofaY + 96);
    this.add.rectangle(sofaX, sofaY - 80, 58, 20, 0x607a5d).setDepth(sofaY + 97);
    this.add.rectangle(sofaX, sofaY, 51, 2, 0x789176).setDepth(sofaY + 98);
    this.add.line(0, 0, sofaX - 23, sofaY, sofaX + 23, sofaY, 0x324733, 1).setOrigin(0).setDepth(sofaY + 99);
    addCollider(sofaX, sofaY, 72, 188);

    // ローテーブル。
    this.drawWoodTable(335, 470, 132, 78, addCollider);

    // テレビとテレビ台。
    this.add.rectangle(488, 452, 30, 168, 0x5a4635).setStrokeStyle(2, 0x33291f).setDepth(540);
    this.add.rectangle(482, 444, 18, 120, 0x171a1c).setStrokeStyle(3, 0x4b5357).setDepth(541);
    this.add.rectangle(482, 444, 10, 103, 0x27343b).setDepth(542);
    this.add.rectangle(488, 535, 45, 24, 0x76583d).setStrokeStyle(2, 0x463322).setDepth(543);
    addCollider(488, 452, 42, 168);

    // 木床側の机と椅子。
    this.drawWoodTable(345, 655, 145, 46, addCollider);
    this.drawChair(345, 610, 'down', addCollider);
  }

  private drawWorkRoomObjects(
    addCollider: (x: number, y: number, width: number, height: number) => unknown,
  ) {
    // 部屋中央の長机。
    this.drawWoodTable(785, 495, 176, 72, addCollider);

    // 長机を囲む椅子。移動できる余白も残す。
    this.drawChair(730, 428, 'down', addCollider);
    this.drawChair(840, 428, 'down', addCollider);
    this.drawChair(730, 563, 'up', addCollider);
    this.drawChair(840, 563, 'up', addCollider);
    this.drawChair(895, 495, 'left', addCollider);

    // 壁際の本棚。
    this.add.rectangle(680, 625, 48, 132, 0x644b35).setStrokeStyle(3, 0x3c2c20).setDepth(700);
    for (const y of [585, 615, 645, 675]) {
      this.add.line(0, 0, 658, y, 702, y, 0x35271d, 1).setOrigin(0).setDepth(701);
    }
    for (let i = 0; i < 6; i += 1) {
      const color = [0x6e4f3c, 0x596b54, 0x8a6c45][i % 3];
      this.add.rectangle(666 + i * 6, 598, 5, 20, color).setDepth(702);
    }
    addCollider(680, 625, 48, 132);
  }

  private drawEntranceObjects(
    addCollider: (x: number, y: number, width: number, height: number) => unknown,
  ) {
    // 下駄箱。
    this.add.rectangle(470, 766, 42, 78, 0x71553b).setStrokeStyle(3, 0x433224).setDepth(820);
    this.add.line(0, 0, 451, 750, 489, 750, 0x433224, 1).setOrigin(0).setDepth(821);
    this.add.line(0, 0, 451, 774, 489, 774, 0x433224, 1).setOrigin(0).setDepth(821);
    this.add.circle(480, 762, 2, 0xd1ae72).setDepth(822);
    addCollider(470, 766, 42, 78);

    // 玄関マット。
    this.add
      .rectangle(610, 790, 90, 34, 0x65734e)
      .setStrokeStyle(2, 0x3d482f)
      .setDepth(790);
  }

  private drawWoodTable(
    x: number,
    y: number,
    width: number,
    height: number,
    addCollider: (x: number, y: number, width: number, height: number) => unknown,
  ) {
    const bottom = y + height / 2;
    this.add.ellipse(x + 5, bottom + 8, width * 0.9, 18, 0x251c16, 0.24).setDepth(bottom - 2);
    this.add
      .rectangle(x, y, width, height, 0x805737)
      .setStrokeStyle(3, 0x4b3323)
      .setDepth(bottom);
    this.add.rectangle(x, y - height / 2 + 7, width - 8, 8, 0xa4764e).setDepth(bottom + 1);

    const grain = this.add.graphics().setDepth(bottom + 2);
    grain.lineStyle(1, 0x624328, 0.65);
    for (let offset = -width / 2 + 18; offset < width / 2; offset += 28) {
      grain.lineBetween(x + offset, y - height / 2 + 8, x + offset + 9, y + height / 2 - 8);
    }

    // 脚は少し内側に配置。
    this.add.rectangle(x - width / 2 + 16, bottom + 7, 10, 18, 0x4a3222).setDepth(bottom - 1);
    this.add.rectangle(x + width / 2 - 16, bottom + 7, 10, 18, 0x4a3222).setDepth(bottom - 1);
    addCollider(x, y, width, height);
  }

  private drawChair(
    x: number,
    y: number,
    direction: ChairDirection,
    addCollider: (x: number, y: number, width: number, height: number) => unknown,
  ) {
    const horizontal = direction === 'left' || direction === 'right';
    const width = horizontal ? 38 : 32;
    const height = horizontal ? 32 : 38;
    const depth = y + height / 2;

    this.add.ellipse(x + 2, y + height / 2 - 1, width, 12, 0x241c17, 0.22).setDepth(depth - 2);
    this.add
      .rectangle(x, y, width - 8, height - 10, 0x596b61)
      .setStrokeStyle(2, 0x33433b)
      .setDepth(depth);

    const backOffset = 13;
    if (direction === 'up') {
      this.add.rectangle(x, y + backOffset, width, 8, 0x40554a).setDepth(depth + 1);
    } else if (direction === 'down') {
      this.add.rectangle(x, y - backOffset, width, 8, 0x40554a).setDepth(depth + 1);
    } else if (direction === 'left') {
      this.add.rectangle(x + backOffset, y, 8, height, 0x40554a).setDepth(depth + 1);
    } else {
      this.add.rectangle(x - backOffset, y, 8, height, 0x40554a).setDepth(depth + 1);
    }

    addCollider(x, y, width, height);
  }

  private drawKitchenFloor(zone: Zone) {
    this.add.rectangle(zone.x, zone.y, zone.width, zone.height, 0xf1f0eb).setOrigin(0).setDepth(1);
    const grid = this.add.graphics().setDepth(2);
    grid.lineStyle(1, 0xc9c9c3, 0.8);
    for (let x = zone.x; x <= zone.x + zone.width; x += 38) {
      grid.lineBetween(x, zone.y, x, zone.y + zone.height);
    }
    for (let y = zone.y; y <= zone.y + zone.height; y += 38) {
      grid.lineBetween(zone.x, y, zone.x + zone.width, y);
    }
  }

  private drawWoodArea(zone: Zone) {
    this.add.rectangle(zone.x, zone.y, zone.width, zone.height, 0xb88d61).setOrigin(0).setDepth(1);
    const lines = this.add.graphics().setDepth(2);
    lines.lineStyle(1, 0x8c6544, 0.78);
    for (let y = zone.y; y <= zone.y + zone.height; y += 22) {
      lines.lineBetween(zone.x, y, zone.x + zone.width, y);
      const shift = Math.floor((y - zone.y) / 22) % 2 === 0 ? 0 : 34;
      for (let x = zone.x + shift; x < zone.x + zone.width; x += 68) {
        lines.lineBetween(x, y, x, Math.min(y + 22, zone.y + zone.height));
      }
    }
  }

  private drawTatamiArea(zone: Zone) {
    this.add.rectangle(zone.x, zone.y, zone.width, zone.height, 0xb8bf82).setOrigin(0).setDepth(1);
    const grid = this.add.graphics().setDepth(2);
    grid.lineStyle(3, 0x7e895b, 0.7);

    const matWidth = zone.width / 4;
    const matHeight = zone.height / 3;
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const x = zone.x + col * matWidth;
        const y = zone.y + row * matHeight;
        grid.strokeRect(x + 2, y + 2, matWidth - 4, matHeight - 4);
        if ((row + col) % 2 === 0) {
          grid.lineStyle(1, 0x9ea66f, 0.45);
          grid.lineBetween(x + matWidth / 2, y + 5, x + matWidth / 2, y + matHeight - 5);
          grid.lineStyle(3, 0x7e895b, 0.7);
        }
      }
    }
  }

  private drawMixedRoom(zone: Zone) {
    const tatamiHeight = Math.round(zone.height * 0.66);
    this.drawTatamiArea({ ...zone, height: tatamiHeight });
    this.drawWoodArea({
      ...zone,
      y: zone.y + tatamiHeight,
      height: zone.height - tatamiHeight,
    });

    // 畳と板間の境目。
    this.add
      .rectangle(zone.x + zone.width / 2, zone.y + tatamiHeight, zone.width, 7, 0x66513a)
      .setDepth(3);
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
        fontSize: '17px',
        color: '#30291f',
        fontStyle: 'bold',
        backgroundColor: 'rgba(245, 239, 220, 0.66)',
        padding: { x: 7, y: 4 },
      })
      .setDepth(9000);
  }

  private createPlayer(x: number, y: number) {
    this.createAvatarTexture('avatar-idle', false);
    this.createAvatarTexture('avatar-step', true);

    this.playerShadow = this.add
      .ellipse(x, y + 19, 30, 12, 0x17130f, 0.28)
      .setDepth(y - 2);

    this.player = this.physics.add.sprite(x, y, 'avatar-idle');
    this.player.setDepth(y + 20);
    this.player.body!.setSize(22, 18);
    this.player.body!.setOffset(9, 34);

    this.playerLabel = this.add
      .text(x, y - 39, 'YOU', {
        fontFamily: 'sans-serif',
        fontSize: '11px',
        color: '#ffffff',
        backgroundColor: '#263229',
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(10000);
  }

  private createAvatarTexture(key: string, stepping: boolean) {
    const texture = this.textures.createCanvas(key, 40, 56)!;
    const context = texture.context;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, 40, 56);

    // 髪と顔。
    context.fillStyle = '#26352d';
    context.fillRect(11, 3, 18, 5);
    context.fillRect(8, 8, 24, 11);
    context.fillStyle = '#efc09b';
    context.fillRect(11, 10, 18, 13);
    context.fillStyle = '#2b2b29';
    context.fillRect(14, 14, 2, 2);
    context.fillRect(24, 14, 2, 2);
    context.fillStyle = '#c98366';
    context.fillRect(18, 19, 4, 1);

    // 首、胴体、腕。
    context.fillStyle = '#e5ad86';
    context.fillRect(17, 23, 6, 4);
    context.fillStyle = '#3e7392';
    context.fillRect(9, 27, 22, 18);
    context.fillStyle = '#315f79';
    context.fillRect(6, 29, 5, 15);
    context.fillRect(29, 29, 5, 15);
    context.fillStyle = '#efc09b';
    context.fillRect(6, 42, 5, 4);
    context.fillRect(29, 42, 5, 4);

    // 脚と靴。歩行フレームでは左右を少しずらす。
    context.fillStyle = '#2b3540';
    if (stepping) {
      context.fillRect(11, 44, 7, 8);
      context.fillRect(23, 43, 7, 10);
      context.fillStyle = '#1c2228';
      context.fillRect(9, 51, 9, 4);
      context.fillRect(23, 52, 10, 3);
    } else {
      context.fillRect(11, 44, 7, 9);
      context.fillRect(22, 44, 7, 9);
      context.fillStyle = '#1c2228';
      context.fillRect(9, 52, 9, 3);
      context.fillRect(22, 52, 9, 3);
    }

    texture.refresh();
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
