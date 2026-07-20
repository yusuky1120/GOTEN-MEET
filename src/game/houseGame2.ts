import Phaser from 'phaser';

type Zone={name:string;x:number;y:number;width:number;height:number};
type Dir='up'|'down'|'left'|'right';
type Seat={kind:'chair'|'sofa';x:number;y:number;direction:Dir;standX:number;standY:number};
type ColliderAdder=(x:number,y:number,w:number,h:number)=>unknown;

const WW=1040,WH=860,WALL=12,WALL_COLOR=0x493d30,SPEED=175,RANGE=68;

class HouseScene extends Phaser.Scene{
  private player!:Phaser.Physics.Arcade.Sprite;
  private shadow!:Phaser.GameObjects.Ellipse;
  private label!:Phaser.GameObjects.Text;
  private prompt!:Phaser.GameObjects.Text;
  private cursors!:Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!:Record<'W'|'A'|'S'|'D',Phaser.Input.Keyboard.Key>;
  private action!:Phaser.Input.Keyboard.Key;
  private cancel!:Phaser.Input.Keyboard.Key;
  private zones:Zone[]=[];
  private seats:Seat[]=[];
  private seated:Seat|null=null;
  private room='';
  private lastStep=0;
  private stepping=false;
  private dismissedUntil=0;

  create(){
    this.cameras.main.setBackgroundColor('#252019');
    this.physics.world.setBounds(0,0,WW,WH);
    const blockers=this.drawMap();
    this.createPlayer(580,770);
    this.physics.add.collider(this.player,blockers);
    this.player.setCollideWorldBounds(true);
    this.cursors=this.input.keyboard!.createCursorKeys();
    this.keys=this.input.keyboard!.addKeys('W,A,S,D') as Record<'W'|'A'|'S'|'D',Phaser.Input.Keyboard.Key>;
    this.action=this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.cancel=this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.prompt=this.add.text(480,624,'',{fontFamily:'sans-serif',fontSize:'15px',color:'#fffaf0',backgroundColor:'rgba(28,31,25,.94)',padding:{x:16,y:10},align:'center'}).setOrigin(.5).setScrollFactor(0).setDepth(30000).setVisible(false);
    this.cameras.main.setBounds(0,0,WW,WH).startFollow(this.player,true,.11,.11).setZoom(1.08);
    this.updateRoom();
  }

  update(time:number){
    if(this.seated){
      this.player.setVelocity(0,0);
      if(Phaser.Input.Keyboard.JustDown(this.action)||Phaser.Input.Keyboard.JustDown(this.cancel))this.standUp();
      this.presentPlayer();this.updateRoom();return;
    }
    let x=0,y=0;
    if(this.cursors.left.isDown||this.keys.A.isDown)x--;
    if(this.cursors.right.isDown||this.keys.D.isDown)x++;
    if(this.cursors.up.isDown||this.keys.W.isDown)y--;
    if(this.cursors.down.isDown||this.keys.S.isDown)y++;
    const v=new Phaser.Math.Vector2(x,y),moving=v.lengthSq()>0;
    if(moving)v.normalize().scale(SPEED);
    this.player.setVelocity(v.x,v.y);
    if(x<0)this.player.setFlipX(true);if(x>0)this.player.setFlipX(false);
    if(moving&&time-this.lastStep>170){this.stepping=!this.stepping;this.player.setTexture(this.stepping?'avatar-step':'avatar-idle');this.lastStep=time;}
    else if(!moving){this.stepping=false;this.player.setTexture('avatar-idle');}
    this.updateSeatPrompt(time);this.presentPlayer();this.updateRoom();
  }

  private updateSeatPrompt(time:number){
    if(time<this.dismissedUntil){this.prompt.setVisible(false);return;}
    const seat=this.nearestSeat();
    if(!seat){this.prompt.setVisible(false);return;}
    const name=seat.kind==='sofa'?'ソファ':'椅子';
    this.prompt.setText(`${name}に座りますか？   [E] はい   [Esc] いいえ`).setVisible(true);
    if(Phaser.Input.Keyboard.JustDown(this.action))this.sit(seat);
    else if(Phaser.Input.Keyboard.JustDown(this.cancel)){this.prompt.setVisible(false);this.dismissedUntil=time+900;}
  }

  private nearestSeat(){
    let hit:Seat|null=null,d=RANGE;
    for(const s of this.seats){const n=Phaser.Math.Distance.Between(this.player.x,this.player.y,s.x,s.y);if(n<d){hit=s;d=n;}}
    return hit;
  }

  private sit(seat:Seat){
    this.seated=seat;
    const body=this.player.body as Phaser.Physics.Arcade.Body;body.stop();body.enable=false;
    this.player.setPosition(seat.x,seat.y-3).setTexture('avatar-sit').setFlipX(seat.direction==='left');
    this.prompt.setText('着席中   [E] または [Esc] で立つ').setVisible(true);
  }

  private standUp(){
    if(!this.seated)return;
    const seat=this.seated,body=this.player.body as Phaser.Physics.Arcade.Body;body.enable=true;
    this.player.setPosition(seat.standX,seat.standY).setTexture('avatar-idle').setFlipX(false);
    this.seated=null;this.prompt.setVisible(false);this.dismissedUntil=this.time.now+450;
  }

  private presentPlayer(){
    this.shadow.setPosition(this.player.x,this.player.y+(this.seated?15:19)).setDepth(this.player.y-2);
    this.player.setDepth(this.player.y+20);this.label.setPosition(this.player.x,this.player.y-(this.seated?35:39));
  }

  private drawMap(){
    const group=this.physics.add.staticGroup();
    const collider:ColliderAdder=(x,y,w,h)=>{const r=this.add.rectangle(x,y,w,h,0,0);this.physics.add.existing(r,true);group.add(r);return r;};
    const wall=(x:number,y:number,w:number,h:number)=>{this.add.rectangle(x,y,w,h,WALL_COLOR).setStrokeStyle(2,0x2d251d).setDepth(y+h/2);collider(x,y,w,h);};
    this.add.rectangle(WW/2,WH/2,940,800,0xd6c7a4).setStrokeStyle(8,0x30291f).setDepth(0);
    const kitchen={name:'キッチン',x:180,y:70,width:520,height:170};
    const hallH={name:'廊下',x:120,y:240,width:800,height:70};
    const living={name:'リビング',x:120,y:310,width:400,height:400};
    const hallV={name:'廊下',x:520,y:310,width:120,height:400};
    const work={name:'作業部屋',x:640,y:310,width:280,height:400};
    const entrance={name:'玄関',x:440,y:710,width:280,height:110};
    this.zones=[kitchen,hallH,living,hallV,work,entrance];
    this.drawKitchenFloor(kitchen);this.drawWood(hallH);this.drawMixed(living);this.drawWood(hallV);this.drawMixed(work);this.drawTiles(entrance);
    this.addLabel(kitchen,18,14);this.addLabel(hallH,360,18);this.addLabel(living,18,18);this.addLabel(work,18,18);this.addLabel(entrance,112,68);
    [[440,70,520,WALL],[180,155,WALL,170],[700,155,WALL,170],[150,240,60,WALL],[810,240,220,WALL],[120,275,WALL,70],[920,275,WALL,70],[190,310,140,WALL],[450,310,140,WALL],[120,510,WALL,400],[520,405,WALL,190],[520,650,WALL,120],[280,710,320,WALL],[690,310,100,WALL],[875,310,90,WALL],[920,510,WALL,400],[640,375,WALL,130],[640,615,WALL,190],[820,710,200,WALL],[440,765,WALL,110],[720,765,WALL,110],[495,820,110,WALL],[665,820,110,WALL]].forEach(a=>wall(a[0],a[1],a[2],a[3]));
    this.drawKitchen(collider);this.drawLiving(collider);this.drawWork(collider);this.drawEntrance(collider);
    return group;
  }

  private drawKitchen(add:ColliderAdder){
    this.add.rectangle(434,113,360,52,0x777777,.18).setDepth(160);
    this.add.rectangle(430,108,360,52,0xf3f2ee).setStrokeStyle(3,0x9a9993).setDepth(161);
    this.add.rectangle(430,94,352,20,0xffffff).setStrokeStyle(2,0xaaa9a3).setDepth(162);
    this.add.rectangle(360,92,92,28,0xaeb8ba).setStrokeStyle(2,0x697477).setDepth(165);this.add.ellipse(360,92,48,16,0x7f8d90).setDepth(166);
    this.add.rectangle(505,91,92,30,0x323230).setStrokeStyle(2,0x171716).setDepth(166);[-25,25].forEach(d=>this.add.circle(505+d,91,9,0x191918).setStrokeStyle(2,0x65645f).setDepth(167));
    [285,370,455,540].forEach(x=>{this.add.rectangle(x,124,72,24,0xf2f1ed).setStrokeStyle(1,0xaaa9a3).setDepth(168);this.add.circle(x,124,2,0x77746f).setDepth(169);});
    this.add.rectangle(640,117,54,92,0xe5e7e4).setStrokeStyle(3,0x8c908d).setDepth(170);this.add.line(0,0,614,112,666,112,0x8c908d,1).setOrigin(0).setDepth(171);
    add(430,108,360,87);add(640,117,54,92);
    this.drawTable(430,195,150,46,add,0xf4f3ef,0xa3a19b,false);this.drawChair(330,196,'right',add,0x2f3132);this.drawChair(530,196,'left',add,0x2f3132);
  }

  private drawLiving(add:ColliderAdder){
    this.drawSofa(182,405,68,86,add);this.drawSofa(182,510,68,86,add);
    this.drawTable(340,468,132,78,add,0x5a3825,0x342117,true);
    this.add.rectangle(488,452,30,168,0x5a4635).setStrokeStyle(2,0x33291f).setDepth(540);this.add.rectangle(482,444,18,120,0x171a1c).setStrokeStyle(3,0x4b5357).setDepth(541);this.add.rectangle(482,444,10,103,0x27343b).setDepth(542);this.add.rectangle(488,535,45,24,0x76583d).setStrokeStyle(2,0x463322).setDepth(543);add(488,452,42,168);
    this.drawTable(158,645,46,116,add,0xf3f2ee,0x999792,false);this.drawChair(222,645,'left',add,0x252728);
  }

  private drawWork(add:ColliderAdder){
    this.drawTable(790,480,72,190,add,0xf4f3ef,0x999792,false);
    [[765,350,'down'],[815,350,'down'],[720,425,'right'],[720,535,'right'],[860,425,'left'],[860,535,'left'],[790,600,'up']].forEach(v=>this.drawChair(v[0] as number,v[1] as number,v[2] as Dir,add,0x202224));
    this.drawTable(790,666,142,44,add,0xf4f3ef,0x999792,false);this.drawPc(790,646);
  }

  private drawPc(x:number,y:number){
    this.add.rectangle(x,y,58,34,0x25282b).setStrokeStyle(3,0x101214).setDepth(y+30);this.add.rectangle(x,y,48,24,0x557083).setDepth(y+31);this.add.rectangle(x,y+22,8,13,0x303337).setDepth(y+32);this.add.rectangle(x,y+29,30,6,0x303337).setDepth(y+32);this.add.rectangle(x-28,y+31,46,10,0xd8d8d5).setStrokeStyle(1,0x8d8d89).setDepth(y+33);this.add.ellipse(x+38,y+31,10,14,0x3d4042).setDepth(y+33);
  }

  private drawEntrance(add:ColliderAdder){
    this.add.rectangle(470,766,42,78,0x71553b).setStrokeStyle(3,0x433224).setDepth(820);this.add.line(0,0,451,750,489,750,0x433224,1).setOrigin(0).setDepth(821);this.add.line(0,0,451,774,489,774,0x433224,1).setOrigin(0).setDepth(821);add(470,766,42,78);this.add.rectangle(610,790,90,34,0x65734e).setStrokeStyle(2,0x3d482f).setDepth(790);
  }

  private drawTable(x:number,y:number,w:number,h:number,add:ColliderAdder,top:number,edge:number,grain:boolean){
    const bottom=y+h/2,highlight=Phaser.Display.Color.IntegerToColor(top).brighten(12).color;
    this.add.ellipse(x+5,bottom+8,w*.9,18,0x251c16,.18).setDepth(bottom-2);this.add.rectangle(x,y,w,h,top).setStrokeStyle(3,edge).setDepth(bottom);this.add.rectangle(x,y-h/2+7,w-8,8,highlight).setDepth(bottom+1);
    if(grain){const g=this.add.graphics().setDepth(bottom+2);g.lineStyle(1,edge,.58);const n=Math.max(2,Math.floor(w/28));for(let i=1;i<=n;i++){const dx=-w/2+w*i/(n+1);g.lineBetween(x+dx,y-h/2+8,x+dx+6,y+h/2-8);}}
    this.add.rectangle(x-w/2+13,bottom+7,9,18,edge).setDepth(bottom-1);this.add.rectangle(x+w/2-13,bottom+7,9,18,edge).setDepth(bottom-1);add(x,y,w,h);
  }

  private drawChair(x:number,y:number,dir:Dir,add:ColliderAdder,color=0x596b61){
    const horizontal=dir==='left'||dir==='right',w=horizontal?38:32,h=horizontal?32:38,depth=y+h/2,back=Phaser.Display.Color.IntegerToColor(color).darken(18).color;
    this.add.ellipse(x+2,y+h/2-1,w,12,0x241c17,.22).setDepth(depth-2);this.add.rectangle(x,y,w-8,h-10,color).setStrokeStyle(2,back).setDepth(depth);
    const o=13;if(dir==='up')this.add.rectangle(x,y+o,w,8,back).setDepth(depth+1);else if(dir==='down')this.add.rectangle(x,y-o,w,8,back).setDepth(depth+1);else if(dir==='left')this.add.rectangle(x+o,y,8,h,back).setDepth(depth+1);else this.add.rectangle(x-o,y,8,h,back).setDepth(depth+1);
    add(x,y,w,h);this.registerSeat('chair',x,y,dir,46);
  }

  private drawSofa(x:number,y:number,w:number,h:number,add:ColliderAdder){
    const body=0x805737,edge=0x4b3323,cushion=0x966a45;
    this.add.ellipse(x+5,y+h/2+8,w+12,18,0x251c16,.22).setDepth(y+h/2-2);this.add.rectangle(x,y,w,h,body).setStrokeStyle(3,edge).setDepth(y+h/2);this.add.rectangle(x-w/2+9,y,16,h-8,edge).setDepth(y+h/2+1);this.add.rectangle(x+6,y-20,w-25,34,cushion).setDepth(y+h/2+2);this.add.rectangle(x+6,y+20,w-25,34,cushion).setDepth(y+h/2+2);this.add.line(0,0,x-w/2+16,y,x+w/2-4,y,edge,1).setOrigin(0).setDepth(y+h/2+3);add(x,y,w,h);
    [-20,20].forEach(d=>this.seats.push({kind:'sofa',x:x+8,y:y+d,direction:'right',standX:x+w/2+42,standY:y+d}));
  }

  private registerSeat(kind:'chair'|'sofa',x:number,y:number,dir:Dir,d:number){
    const standX=dir==='left'?x+d:dir==='right'?x-d:x,standY=dir==='up'?y+d:dir==='down'?y-d:y;this.seats.push({kind,x,y,direction:dir,standX,standY});
  }

  private drawKitchenFloor(z:Zone){this.add.rectangle(z.x,z.y,z.width,z.height,0xf1f0eb).setOrigin(0).setDepth(1);const g=this.add.graphics().setDepth(2);g.lineStyle(1,0xc9c9c3,.8);for(let x=z.x;x<=z.x+z.width;x+=38)g.lineBetween(x,z.y,x,z.y+z.height);for(let y=z.y;y<=z.y+z.height;y+=38)g.lineBetween(z.x,y,z.x+z.width,y);}
  private drawWood(z:Zone){this.add.rectangle(z.x,z.y,z.width,z.height,0xb88d61).setOrigin(0).setDepth(1);const g=this.add.graphics().setDepth(2);g.lineStyle(1,0x8c6544,.78);for(let y=z.y;y<=z.y+z.height;y+=22){g.lineBetween(z.x,y,z.x+z.width,y);const s=Math.floor((y-z.y)/22)%2?34:0;for(let x=z.x+s;x<z.x+z.width;x+=68)g.lineBetween(x,y,x,Math.min(y+22,z.y+z.height));}}
  private drawTatami(z:Zone){this.add.rectangle(z.x,z.y,z.width,z.height,0xd5bd83).setOrigin(0).setDepth(1);const g=this.add.graphics().setDepth(2);g.lineStyle(3,0x7e895b,.78);const cols=z.width<320?3:4,rows=3,mw=z.width/cols,mh=z.height/rows;for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const x=z.x+c*mw,y=z.y+r*mh;g.strokeRect(x+2,y+2,mw-4,mh-4);if((r+c)%2===0){g.lineStyle(1,0xb69b68,.45);g.lineBetween(x+mw/2,y+5,x+mw/2,y+mh-5);g.lineStyle(3,0x7e895b,.78);}}}
  private drawMixed(z:Zone){const th=Math.round(z.height*.66);this.drawTatami({...z,height:th});this.drawWood({...z,y:z.y+th,height:z.height-th});this.add.rectangle(z.x+z.width/2,z.y+th,z.width,7,0x7e895b).setDepth(3);}
  private drawTiles(z:Zone){this.add.rectangle(z.x,z.y,z.width,z.height,0xc8c6bd).setOrigin(0).setDepth(1);const g=this.add.graphics().setDepth(2);g.lineStyle(1,0xa8a69e,.9);for(let x=z.x;x<=z.x+z.width;x+=35)g.lineBetween(x,z.y,x,z.y+z.height);for(let y=z.y;y<=z.y+z.height;y+=35)g.lineBetween(z.x,y,z.x+z.width,y);}
  private addLabel(z:Zone,ox:number,oy:number){this.add.text(z.x+ox,z.y+oy,z.name,{fontFamily:'sans-serif',fontSize:'17px',color:'#30291f',fontStyle:'bold',backgroundColor:'rgba(245,239,220,.66)',padding:{x:7,y:4}}).setDepth(9000);}

  private createPlayer(x:number,y:number){
    this.avatarTexture('avatar-idle',false,false);this.avatarTexture('avatar-step',true,false);this.avatarTexture('avatar-sit',false,true);
    this.shadow=this.add.ellipse(x,y+19,30,12,0x17130f,.28).setDepth(y-2);this.player=this.physics.add.sprite(x,y,'avatar-idle').setDepth(y+20);this.player.body!.setSize(22,18);this.player.body!.setOffset(9,34);this.label=this.add.text(x,y-39,'YOU',{fontFamily:'sans-serif',fontSize:'11px',color:'#fff',backgroundColor:'#263229',padding:{x:5,y:2}}).setOrigin(.5).setDepth(10000);
  }

  private avatarTexture(key:string,step:boolean,sit:boolean){
    if(this.textures.exists(key))return;const t=this.textures.createCanvas(key,40,56)!,c=t.context;c.imageSmoothingEnabled=false;c.clearRect(0,0,40,56);
    c.fillStyle='#26352d';c.fillRect(11,3,18,5);c.fillRect(8,8,24,11);c.fillStyle='#efc09b';c.fillRect(11,10,18,13);c.fillStyle='#2b2b29';c.fillRect(14,14,2,2);c.fillRect(24,14,2,2);c.fillStyle='#c98366';c.fillRect(18,19,4,1);c.fillStyle='#e5ad86';c.fillRect(17,23,6,4);c.fillStyle='#3e7392';c.fillRect(9,27,22,sit?16:18);c.fillStyle='#315f79';c.fillRect(6,29,5,15);c.fillRect(29,29,5,15);c.fillStyle='#efc09b';c.fillRect(6,42,5,4);c.fillRect(29,42,5,4);c.fillStyle='#2b3540';
    if(sit){c.fillRect(10,42,9,7);c.fillRect(21,42,9,7);c.fillStyle='#1c2228';c.fillRect(8,48,12,5);c.fillRect(20,48,12,5);}else if(step){c.fillRect(11,44,7,8);c.fillRect(23,43,7,10);c.fillStyle='#1c2228';c.fillRect(9,51,9,4);c.fillRect(23,52,10,3);}else{c.fillRect(11,44,7,9);c.fillRect(22,44,7,9);c.fillStyle='#1c2228';c.fillRect(9,52,10,3);c.fillRect(22,52,10,3);}t.refresh();
  }

  private updateRoom(){const room=this.zones.find(z=>this.player.x>=z.x&&this.player.x<=z.x+z.width&&this.player.y>=z.y&&this.player.y<=z.y+z.height)?.name??'共用スペース';if(room!==this.room){this.room=room;window.dispatchEvent(new CustomEvent('goten:room-change',{detail:room}));}}
}

export function createGameConfig(parent:HTMLElement):Phaser.Types.Core.GameConfig{return{type:Phaser.AUTO,parent,width:960,height:680,backgroundColor:'#252019',pixelArt:true,physics:{default:'arcade',arcade:{debug:false}},scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},scene:[HouseScene]};}
