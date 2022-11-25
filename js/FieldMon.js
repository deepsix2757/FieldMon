import * as THREE from 'three';
import { Frustum } from 'three';
import { OrbitControls } from './jsm/controls/OrbitControls.js';
import { PLYExporter } from './jsm/exporters/PLYExporter.js';
import { GUI } from './jsm/libs/lil-gui.module.min.js';
import { FontLoader } from './jsm/loaders/FontLoader.js';
import { TextGeometry } from './jsm/geometries/TextGeometry.js';

let scene, camera, renderer, exporter, boxFont, controls;
let profiles, objs;

// Fontloader를 미리 구동시키기 위한 Setting, 미리 loading 되어 있어야 font 객체 재사용 가능 - 메모리 문제 해결
const manager = new THREE.LoadingManager();
manager.onLoad = function() { 
    // when all resources are loaded
    init();
    animate();
}

const loadProfile = function(){
    profiles = JSON.parse(JSON.stringify(Profile));
}

const loadFont = function(fontName){
    const fontloader = new FontLoader(manager);
    boxFont = fontloader.load( './fonts/' + fontName, function(response){
        boxFont = response;
    });
}

loadProfile();
loadFont(profiles.box.fontName);

const loadObjects = function(){
    objs = JSON.parse(JSON.stringify(Objects));
}

const setScene = function(){
    scene = new THREE.Scene();
    scene.background = new THREE.Color( profiles.background.color );
    // scene.fog = new THREE.Fog( 0xa0a0a0, 200, 1000 );
    exporter = new PLYExporter();
}

const addBoxes = function(objectName){
    var idx;
    for( idx in objs.eqps ){
        addBox(objs.eqps[idx].name, objs.eqps[idx].posX, objs.eqps[idx].posY, objs.eqps[idx].posZ, 
               objs.eqps[idx].sizeX, objs.eqps[idx].sizeY, objs.eqps[idx].sizeZ, objs.eqps[idx].floorFlag);
    }
}

const addBox = function(name, posX, posY, posZ, sizeX, sizeY, sizeZ, floorFlag){
    let vertexShader = `
        varying vec2 vUv;
        void main()	{
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1);
        }
        `;

    let fragmentShader = `
        varying vec2 vUv;
        uniform float thickness;
        uniform vec3 color;
        uniform vec3 edgeColor;
        float edgeFactor(vec2 p){
            vec2 grid = abs(fract(p - 0.5) - 0.5) / fwidth(p) / thickness;
            return min(grid.x, grid.y);
        }
        void main() {
            float a = clamp(edgeFactor(vUv), 0., 1.);
            vec3 c = mix(edgeColor, color, a);
            gl_FragColor = vec4(c, 1.0);
        }
        `;

    const material = new THREE.ShaderMaterial({
        uniforms: { 
            thickness: {value: profiles.box.edgeThickness},
            color: {value: new THREE.Color(profiles.box.color)},
            edgeColor:{value: new THREE.Color(profiles.box.edgeColor)}
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        extensions: {derivatives: true}
    });
    const geometry = new THREE.BoxGeometry( sizeX, sizeY, sizeZ );
    const mesh = new THREE.Mesh( geometry, material );
    mesh.position.x = posX;
    if( floorFlag.toUpperCase() === "Y" ){
        mesh.position.y = sizeY/2 + 10;
    }
    else{
        mesh.position.y = posY;
    }
    mesh.position.z = posZ;
    mesh.name = name;
    
    const group = new THREE.Group();
    group.name = name;
    group.add( mesh );
    
    addText(name, profiles.box.fontSize, profiles.box.fontHeight, 
            mesh.position.x, mesh.position.y, mesh.position.z, 200, Math.PI/2, group);
    
    setPosTo(group.children[1], group.children[0], "top");
    scene.add( group );
}

const addText = function(text, fontSize, fontHeight, posX, posY, posZ, floating, rotation, group){
    const textGeometry = new TextGeometry( text, {
            font: boxFont,
            size: fontSize,
            height: fontHeight,
            curveSegments: 5, // fixed
            bevelThickness: 0.1, // fixed
            bevelSize: 0.1, // fixed
            bevelEnabled: false
        });

    const textMaterial = new THREE.MeshPhongMaterial( { color: profiles.box.textColor} );
    const mesh = new THREE.Mesh( textGeometry, textMaterial );
    mesh.position.x = posX;
    mesh.position.y = posY + floating;
    mesh.position.z = posZ;
    mesh.rotation.y = rotation;
    if(group === null){ scene.add( mesh ); }
    else { group.add( mesh ); }
}

const setCamera = function(){
    camera = new THREE.PerspectiveCamera( profiles.camera.fov, 
                                          window.innerWidth / window.innerHeight, 
                                          profiles.camera.nearFrustum, 
                                          profiles.camera.farFrustum );
    camera.position.set( profiles.camera.posX, profiles.camera.posY, profiles.camera.posZ );
}

const setLight = function(){
    // 간접 조명
    const hemiLight = new THREE.HemisphereLight( 0xffffff, 0x444444 );
    hemiLight.position.set( 0, 200, 0 );
    scene.add( hemiLight );
    // 직접 조명
    const directionalLight = new THREE.DirectionalLight( 0xffffff );
    directionalLight.position.set( 0, 200, 100 );
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.top = 180;
    directionalLight.shadow.camera.bottom = - 100;
    directionalLight.shadow.camera.left = - 120;
    directionalLight.shadow.camera.right = 120;
    scene.add( directionalLight );
}

const setGround = function(){
    const ground = new THREE.Mesh( new THREE.PlaneGeometry( profiles.floor.sizeX, profiles.floor.sizeZ ), // 1 = 1cm
                                   new THREE.MeshPhongMaterial( { color: profiles.floor.gridColor, depthWrite: false } ) );
    ground.rotation.x = - Math.PI / 2;
    ground.receiveShadow = true;
    scene.add( ground );
    // grid
    const grid = new THREE.GridHelper( profiles.floor.gridHelperSize,
                                       profiles.floor.gridHelperDivision,
                                       profiles.floor.gridHelperColor1,
                                       profiles.floor.gridHelperColor2 );
    grid.material.opacity = profiles.floor.gridHelperOpacity;
    grid.material.transparent = true;
    scene.add( grid );
}

const setRenderer = function(){
    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.shadowMap.enabled = true;
    document.body.appendChild( renderer.domElement );
}

const setControl = function(){
    controls = new OrbitControls( camera, renderer.domElement );
    controls.target.set( 0, 25, 0 );
    controls.update();
    window.addEventListener( 'resize', onWindowResize );
}

const setGUI = function(){
    const gui = new GUI();
    let GuiData = function() {
        this.Reset_View = function() { controls.reset(); };
    };
    const guiData = new GuiData();
    const folder = gui.addFolder("View");
    folder.add(guiData, "Reset_View");
    gui.open();
}

const onWindowResize = function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
}

const animate = function() {
    requestAnimationFrame( animate );
    renderer.render( scene, camera );
}

const setPosTo = function(object, targetObj, direction){
    // targetObj.geometry.computeBoundingBox();
    // const size = targetObj.geometry.boundingBox.getSize();
    // console.log(size);

    let boxObj = new THREE.Box3().setFromObject( object );
    let sizeObj = new THREE.Vector3();
    boxObj.getSize(sizeObj);
    let boxTar = new THREE.Box3().setFromObject( targetObj );
    let sizeTar = new THREE.Vector3();
    boxTar.getSize(sizeTar);
    
    if(direction === "top"){
        object.position.x = targetObj.position.x;
        object.position.y = targetObj.position.y + sizeTar.y/2;
        object.position.z = targetObj.position.z + sizeObj.z/2;
    } 
    else if(direction === "bottom"){
        object.position.x = targetObj.position.x ;
        object.position.y = targetObj.position.y - sizeTar.y/2 - sizeObj.y;
        object.position.z = targetObj.position.z + sizeObj.z/2;
    } 
    else if(direction === "front"){
        object.position.x = targetObj.position.x + sizeTar.x;
        object.position.y = targetObj.position.y;
        object.position.z = targetObj.position.z + sizeObj.z/2;
    }
    else if(direction === "back"){
        object.position.x = targetObj.position.x - sizeTar.x/2 - sizeObj.x;
        object.position.y = targetObj.position.y;
        object.position.z = targetObj.position.z + sizeObj.z/2;
    }
    else if(direction === "right"){
        object.position.x = targetObj.position.x;
        object.position.y = targetObj.position.y;
        object.position.z = targetObj.position.z + sizeTar.z/2;
    }
    else if(direction === "left"){
        object.position.x = targetObj.position.x;
        object.position.y = targetObj.position.y;
        object.position.z = targetObj.position.z - size.z/2;
    }
}

const addColumns = function(){
    let idx;
    for( idx in objs.columns ){
        addColumn(objs.columns[idx].posX, objs.columns[idx].posZ, objs.columns[idx].sizeX, objs.columns[idx].sizeZ);
    }
}

const addColumn = function(posX, posZ, sizeX, sizeZ){
    let vertexShader = `
        varying vec2 vUv;
        void main()	{
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1);
        }
        `;

    let fragmentShader = `
        varying vec2 vUv;
        uniform float thickness;
        uniform vec3 color;
        uniform vec3 edgeColor;
        float edgeFactor(vec2 p){
            vec2 grid = abs(fract(p - 0.5) - 0.5) / fwidth(p) / thickness;
            return min(grid.x, grid.y);
        }
        void main() {
            float a = clamp(edgeFactor(vUv), 0., 1.);
            vec3 c = mix(edgeColor, color, a);
            gl_FragColor = vec4(c, 0.35);
        }
        `;

    const material = new THREE.ShaderMaterial({
        uniforms: { 
            thickness: {value: profiles.column.edgeThickness},
            color: {value: new THREE.Color(profiles.column.color)},
            edgeColor:{value: new THREE.Color(profiles.column.edgeColor)}
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        extensions: {derivatives: true},
        transparent: true
    });
    const geometry = new THREE.BoxGeometry( sizeX, profiles.column.height, sizeZ );
    const mesh = new THREE.Mesh( geometry, material );
    mesh.position.x = posX;
    mesh.position.y = profiles.column.height/2 + 10;
    mesh.position.z = posZ;
    
    const group = new THREE.Group();
    group.add( mesh );
    scene.add( group );
}

const init = function() {
    setCamera();
    setScene();
    setLight();
    setGround();
    setRenderer();
    setControl();
    setGUI();

    loadObjects();
    addColumns();
    addBoxes();
}