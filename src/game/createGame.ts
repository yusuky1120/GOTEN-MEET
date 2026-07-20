import Phaser from 'phaser';

type RoomZone = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const MAP_KEY = 'house-1f';
const TILESET_KEY = 'house-tiles';
const MAP_URL = '/maps/house-1f.json';
const TILESET_URL = '/tiles/house-tiles.svg';
const COLLISION_TILE_IDS = [4, 5, 6, 7, 8];

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

  preload() {
    this.load.tilemapTiledJSON(MAP_KEY, MAP_URL);
    this.load.svg(TILESET_KEY, TILESET_URL, { width: 256, height: 32 });
  }

  create() {
    const map = this.make.tilemap({ key: MAP_KEY });
    const tileset = map.addTilesetImage('house-tiles', TILESET_KEY, 32, 32, 0, 0);

    if (!tileset) {
      throw new Error('Tiled JSON の tileset 名 "house-tiles" を読み込めませんでした。');
    }

    const collisionLayers: Phaser.Tilemaps.TilemapLayer[] = [];

    for (const layerData of map.layers) {
      const layer = map.createLayer(layerData.name, tileset, 0, 0);
      if (!layer) continue;

      layer.setCollisionByProperty({ collides: true });
      layer.setCollision(COLLISION_TILE_IDS);
      collisionLayers.push(layer);
    }

    const spawn = this.readSpawnPoint(map);
    this.createPlayer(spawn.x, spawn.y);
    this.roomZones = this.readRoomZones(map);

    for (const layer of collisionLayers) {
      this.physics.add.collider(this.player, layer);
    }

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.player.setCollideWorldBounds(true);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<
      'W' | 'A' | 'S' | 'D',
      Phaser.Input.Keyboard.Key
    >;

    this.cameras.main.setBackgroundColor('#252019');
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(1);

    this.updateRoomName();
  }

  update() {
    const speed = 170;
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

  private readSpawnPoint(map: Phaser.Tilemaps.Tilemap) {
    const markerLayer = map.getObjectLayer('Markers');
    const marker = markerLayer?.objects.find(
      (object) => object.name === 'spawn' || object.type === 'spawn',
    );

    return {
      x: marker?.x ?? map.tileWidth * 2.5,
      y: marker?.y ?? map.tileHeight * 2.5,
    };
  }

  private readRoomZones(map: Phaser.Tilemaps.Tilemap): RoomZone[] {
    const markerLayer = map.getObjectLayer('Markers');
    if (!markerLayer) return [];

    return markerLayer.objects
      .filter((object) => object.type === 'room' && object.width && object.height)
      .map((object) => {
        const roomNameProperty = object.properties?.find(
          (property: { name?: string; value?: unknown }) => property.name === 'roomName',
        );

        return {
          name:
            typeof roomNameProperty?.value === 'string'
              ? roomNameProperty.value
              : object.name || '名称未設定',
          x: object.x ?? 0,
          y: object.y ?? 0,
          width: object.width ?? 0,
          height: object.height ?? 0,
        };
      });
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
      )?.name ?? 'マップ内';

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
