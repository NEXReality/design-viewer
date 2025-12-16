// This script handles the 3D visualization of the jersey

// DEBUG MODE: Add #debug to the URL to enable (e.g., http://localhost:8080/jersey-configurator/index.html#debug)
const DEBUG_MODE = window.location.hash === '#debug';

// Debug logging helper - only logs when DEBUG_MODE is enabled
function debugLog(...args) {
    if (DEBUG_MODE) {
        console.log(...args);
    }
}

// Import Three.js using import map
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// Model mapping configuration
const MODEL_MAP = {
    'round_reglan': 'round_collar_reglan_01.glb',
    'round_set_in': 'round_collar_set_in_02.glb',
    'insert_reglan': 'insert_collar_reglan_01.glb',
    'insert_set_in': 'insert_collar_set_in_02.glb',
    'v_neck_reglan': 'v_neck_reglan_01.glb',
    'v_neck_set_in': 'v_neck_set_in_01.glb',
    'v_neck_crossed_reglan': 'v_neck_crossed_reglan_01.glb',
    'v_neck_crossed_set_in': 'v_neck_crossed_set_in_01.glb'
};

const CAMERA_POSITION_FOR_PART = {
    'front': { x: 0.00, y: 1.00, z: 4.20 },
    'back': { x: 0.00, y: 1.00, z: -4.20 },
    'left-sleeve': { x: 2.25, y: 1.66, z: 0.00 },
    'right-sleeve': { x: -2.25, y: 1.66, z: 0.00 },
    'collar': { x: 0.0, y: 0.0, z: 0.50 },
    'collar2': { x: 0.0, y: 0.0, z: 0.50 },
    'hem': { x: 0.0, y: 0.95, z: 1.0 },
};

// Helper function to get URL parameters
function getURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        collar: urlParams.get('collar') || 'insert',
        shoulder: urlParams.get('shoulder') || 'reglan'
    };
}

// Helper function to get model path based on selections
function getModelPath(collar, shoulder) {
    const key = `${collar}_${shoulder}`;
    const filename = MODEL_MAP[key];

    if (!filename) {
        console.warn(`No model found for ${collar} + ${shoulder}, using default`);
        return './models/insert_collar_reglan_01.glb';
    }

    return `./models/${filename}`;
}

// Make getModelPath available globally for use in script.js
window.getModelPath = getModelPath;

class JerseyViewer {
    constructor(containerId) {
        this.container = document.querySelector(containerId);
        if (!this.container) {
            console.error(`Container ${containerId} not found`);
            return;
        }

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.jerseyMesh = null;
        this.animationId = null;
        this.gltfLoader = new GLTFLoader();
        this.texture = null;
        this.current3DObject = null;

        // Materials to exclude from texture application (stitches should keep original appearance)
        this.currentPart = 'front';
        this.partCanvases = {};
        this.partTextures = {};
        this.excludedMaterials = ['stitches_sleeves', 'cover_stitches', 'stitches_main'];

        // Bounding boxes for jersey parts (as percentages of canvas)
        // Separate configurations for different shoulder types
        this.partBoundingBoxes_setIn = {
            'front': { x: 0.03, y: 0.14, width: 0.45, height: 0.62 },
            'back': { x: 0.54, y: 0.1, width: 0.45, height: 0.63 },
            'left-sleeve': { x: 0.58, y: 0.75, width: 0.35, height: 0.16 },
            'right-sleeve': { x: 0.08, y: 0.75, width: 0.35, height: 0.16 },
            'collar': { x: 0.0, y: 0.054, width: 0.5, height: 0.03 },
            'collar2': { x: 0.195, y: 0.095, width: 0.105, height: 0.021 },
            'hem': { x: 0.1, y: 0.925, width: 0.82, height: 0.035 },
        };

        this.partBoundingBoxes_reglan = {
            'front': { x: 0.04, y: 0.08, width: 0.425, height: 0.6 },
            'back': { x: 0.53, y: 0.06, width: 0.43, height: 0.6 },
            'left-sleeve': { x: 0.57, y: 0.65, width: 0.35, height: 0.26 },
            'right-sleeve': { x: 0.07, y: 0.65, width: 0.35, height: 0.26 },
            'collar': { x: 0.01, y: 0.05, width: 0.59, height: 0.03 },
            'collar2': { x: 0.2, y: 0.095, width: 0.104, height: 0.021 },
            'hem': { x: 0.1, y: 0.925, width: 0.82, height: 0.035 },
        };

        // Get current shoulder type from URL
        const urlParams = getURLParameters();
        this.currentShoulderType = urlParams.shoulder || 'reglan';

        // Set active bounding boxes based on shoulder type
        this.partBoundingBoxes = this.currentShoulderType === 'set_in'
            ? this.partBoundingBoxes_setIn
            : this.partBoundingBoxes_reglan;

        // Camera reset animation properties
        this.initialCameraPosition = new THREE.Vector3(2, 2, 4);
        this.initialControlsTarget = new THREE.Vector3(0, 0, 0);
        this.cameraResetDuration = 800; // Duration in milliseconds
        this.isAnimatingCamera = false;
        this.cameraAnimationStartTime = 0;

        // Stripe configuration state
        this.stripeOrientation = 'horizontal';
        // Part-aware stripe layer configurations
        // Each part has its own set of 4 stripe layers (tab1-tab4)
        const defaultStripeConfig = {
            tab1: { count: 1, color: '#eaeef1', position: 5, gap: 10, thickness: 5 },
            tab2: { count: 0, color: '#eaeef1', position: 5, gap: 10, thickness: 5 },
            tab3: { count: 0, color: '#eaeef1', position: 5, gap: 10, thickness: 5 },
            tab4: { count: 0, color: '#eaeef1', position: 5, gap: 10, thickness: 5 }
        };

        this.stripeLayersByPart = {
            'front': JSON.parse(JSON.stringify(defaultStripeConfig)),
            'back': JSON.parse(JSON.stringify(defaultStripeConfig)),
            'left-sleeve': JSON.parse(JSON.stringify(defaultStripeConfig)),
            'right-sleeve': JSON.parse(JSON.stringify(defaultStripeConfig)),
            'collar': JSON.parse(JSON.stringify(defaultStripeConfig)),
            'collar2': JSON.parse(JSON.stringify(defaultStripeConfig)),
            'hem': JSON.parse(JSON.stringify(defaultStripeConfig))
        };



        this.init();
        this.createLights();
        this.createGroundPlane();
        this.createTexture();
        this.setupCameraReset();
        this.setupLogoControls(); // Set up logo slider controls on initialization
        this.setupStripeControls(); // Set up stripe controls on initialization
        this.updateStripeUIForCurrentPart(); // Initialize UI with default part's config
        this.animate();
        this.handleResize();


        // Setup 3D logo interaction (raycasting for drag-and-drop)
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isDragging = false;
        this.draggedPart = null;
        this.setupLogoInteraction();

        // Load custom control icons
        this.deleteIcon = new Image();
        this.deleteIcon.src = '../images/delete.svg';
        this.copyIcon = new Image();
        this.copyIcon.src = '../images/copy.svg';
    }

    // Monitor memory usage (helpful for performance debugging)
    logMemoryUsage() {
        if (performance.memory) {
            const used = (performance.memory.usedJSHeapSize / 1048576).toFixed(2);
            const total = (performance.memory.totalJSHeapSize / 1048576).toFixed(2);
            const limit = (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2);
            debugLog(`💾 Memory Usage: ${used} MB / ${total} MB (Limit: ${limit} MB)`);
            return { used, total, limit };
        } else {
            debugLog('💾 Memory API not available (Chrome only)');
            return null;
        }
    }

    // Helper method to check if a material should be excluded from texture application
    shouldExcludeMaterial(material) {
        const materialName = material?.name || '';
        return this.excludedMaterials.includes(materialName);
    }

    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf5f7fa);

        // Create camera
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 1000);
        this.camera.position.set(this.initialCameraPosition.x, this.initialCameraPosition.y, this.initialCameraPosition.z);

        // Create renderer with proper PBR settings
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Configure tone mapping and exposure for neutral lighting
        this.renderer.toneMapping = THREE.NoToneMapping;
        this.renderer.toneMappingExposure = 1.0;

        // Remove placeholder and add renderer
        const placeholder = this.container.querySelector('.viewer-placeholder');
        if (placeholder) {
            placeholder.remove();
        }
        this.container.appendChild(this.renderer.domElement);

        // Create controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 1.2;  // Allow much closer zoom for detail viewing
        this.controls.maxDistance = 10;
        this.controls.target.set(0, 0, 0);
    }

    createLights() {
        // Create an ambient light for base illumination
        this.lightsContainer = new THREE.Object3D();
        this.scene.add(this.lightsContainer);

        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.lightsContainer.add(this.ambientLight);

        // Add directional lights similar to model-viewer's default setup
        this.keyLight = new THREE.DirectionalLight(0xffffff, 1);
        this.keyLight.position.set(-2, 2, 2);
        this.lightsContainer.add(this.keyLight);

        this.fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
        this.fillLight.position.set(2, -1, -1);
        this.lightsContainer.add(this.fillLight);

        this.backLight = new THREE.DirectionalLight(0xffffff, 0.5);
        this.backLight.position.set(1, 3, -2);
        this.lightsContainer.add(this.backLight);

        this.lightsContainer.rotation.y = 2 * Math.PI;

        // Load neutral environment map for PBR lighting
        this.loadEnvironmentMap();
    }

    loadEnvironmentMap() {
        // Create a neutral environment using a data texture
        // This provides proper IBL (Image-Based Lighting) for PBR materials
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        pmremGenerator.compileEquirectangularShader();

        // Create a simple neutral gray environment
        const envScene = new THREE.Scene();
        envScene.background = new THREE.Color(0xcccccc);

        const envMap = pmremGenerator.fromScene(envScene).texture;
        this.scene.environment = envMap;

        pmremGenerator.dispose();

        debugLog('✅ Neutral environment map loaded with exposure 1.0');
    }

    createGroundPlane() {
        // Create a circular ground plane with soft shadow
        const groundGeometry = new THREE.CircleGeometry(5, 64);

        // Create a canvas for the soft shadow gradient
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Create radial gradient for soft contact shadow
        const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.15)');     // Darker in center
        gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.05)');   // Medium
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');        // Transparent at edges

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 512);

        // Create texture from canvas
        const shadowTexture = new THREE.CanvasTexture(canvas);
        shadowTexture.needsUpdate = true;

        // Create material with shadow texture
        const groundMaterial = new THREE.MeshBasicMaterial({
            map: shadowTexture,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            color: 0xffffff
        });

        this.groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
        this.groundPlane.rotation.x = -Math.PI / 2; // Rotate to be horizontal
        this.groundPlane.position.y = -1.5; // Position below the model
        this.groundPlane.receiveShadow = true;

        this.scene.add(this.groundPlane);

        debugLog('✅ Ground plane with soft contact shadow created');
    }

    createTexture() {
        // Define jersey parts
        const parts = ['front', 'back', 'right-sleeve', 'left-sleeve', 'collar', 'hem'];

        // Initialize storage for canvases and textures
        this.partCanvases = {};
        this.partTextures = {};
        this.currentPart = 'front'; // Default active part

        // Material name to part mapping (based on GLB material names)
        this.materialToPartMap = {
            'body_F': 'front',
            'body_B': 'back',
            'sleeves_L': 'left-sleeve',
            'sleeves_R': 'right-sleeve',
            'collar': 'collar',
            'hem': 'hem'
        };

        debugLog('🎨 Initializing multi-canvas architecture...');

        // Create Fabric canvas and Three.js texture for each part
        parts.forEach(part => {
            const canvasId = `fabric-canvas-${part}`;
            const fabricCanvasElement = document.getElementById(canvasId);

            if (!fabricCanvasElement) {
                console.error(`Canvas element not found: ${canvasId}`);
                return;
            }

            // Initialize Fabric.js canvas (optimized for performance)
            this.partCanvases[part] = new fabric.Canvas(fabricCanvasElement, {
                width: 2048,  // Reduced from 4096 for 75% memory reduction
                height: 2048,
                backgroundColor: '#ffffff',
                enableRetinaScaling: false  // Disabled for consistent memory usage
            });

            // Create Three.js texture from Fabric canvas (optimized settings)
            const texture = new THREE.CanvasTexture(fabricCanvasElement);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 4;  // Reduced from max (often 16x) for better performance
            texture.minFilter = THREE.LinearFilter;  // No mipmaps needed for flat textures
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = false;  // Disabled to save 33% texture memory
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.flipY = false; // Flip Y-axis for correct UV mapping

            this.partTextures[part] = texture;

            // Hide the canvas element by default (only visible in debug mode)
            fabricCanvasElement.style.display = 'none';
            fabricCanvasElement.style.position = 'absolute';
            fabricCanvasElement.style.left = '0px';

            // Add event listener for object selection to update UI sliders
            this.partCanvases[part].on('selection:created', (e) => {
                this.updateLogoSliders(e.selected[0]);
            });

            this.partCanvases[part].on('selection:updated', (e) => {
                this.updateLogoSliders(e.selected[0]);
            });

            this.partCanvases[part].on('selection:cleared', () => {
                this.resetLogoSliders();
            });

            debugLog(`✅ Initialized canvas for "${part}": 2048x2048 (optimized)`);
        });

        debugLog(`🎨 Multi-canvas setup complete. ${parts.length} canvases initialized.`);

        // Log memory usage after canvas creation (helps monitor optimization impact)
        this.logMemoryUsage();

        // Enable debug mode if DEBUG_MODE is true
        if (DEBUG_MODE) {
            this.setupDebugMode();
        }
    }

    setupDebugMode() {
        // Show only the active canvas in debug mode
        const activeCanvasId = `fabric-canvas-${this.currentPart}`;
        const fabricCanvasElement = document.getElementById(activeCanvasId);

        if (!fabricCanvasElement) return;

        fabricCanvasElement.setAttribute('data-debug', 'true');

        // Move canvas inside viewer-container and position it there
        const viewerContainer = document.querySelector('.viewer-container');
        if (viewerContainer) {
            // Ensure viewer-container has position relative
            viewerContainer.style.position = 'relative';

            // Move canvas into viewer-container
            viewerContainer.appendChild(fabricCanvasElement);

            // Style the canvas for debug view
            fabricCanvasElement.style.position = 'absolute';
            fabricCanvasElement.style.bottom = '20px';
            fabricCanvasElement.style.right = '20px';
            fabricCanvasElement.style.width = '400px';
            fabricCanvasElement.style.height = '400px';
            fabricCanvasElement.style.border = '3px solid #ff0000';
            fabricCanvasElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
            fabricCanvasElement.style.zIndex = '1000';
            fabricCanvasElement.style.pointerEvents = 'none';
            fabricCanvasElement.style.backgroundColor = '#ffffff';

            debugLog(`🐛 DEBUG MODE ENABLED: Showing "${this.currentPart}" canvas`);

            // Add a debug label
            const debugLabel = document.createElement('div');
            debugLabel.id = 'fabric-debug-label';
            debugLabel.textContent = `Debug: ${this.currentPart.toUpperCase()}`;
            debugLabel.style.cssText = `
                position: absolute;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: #ff0000;
                color: white;
                padding: 6px 12px;
                border-radius: 4px;
                font-family: monospace;
                font-size: 12px;
                font-weight: bold;
                z-index: 1001;
                pointer-events: none;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            `;
            viewerContainer.appendChild(debugLabel);
        }

        // Create debug GUI for lighting controls
        this.createDebugGUI();
    }

    // Switch which canvas is shown in debug mode
    switchDebugCanvas(partName) {
        if (!DEBUG_MODE) return;

        const viewerContainer = document.querySelector('.viewer-container');
        if (!viewerContainer) return;

        // Hide all canvases first and remove debug attribute from containers
        Object.keys(this.partCanvases).forEach(part => {
            const canvasElement = document.getElementById(`fabric-canvas-${part}`);
            if (canvasElement && canvasElement.parentElement === viewerContainer) {
                canvasElement.style.display = 'none';
                // Remove debug attribute from container
                const container = canvasElement.closest('.canvas-container');
                if (container) {
                    container.removeAttribute('data-debug');
                }
            }
        });

        // Show the selected part's canvas
        const activeCanvasId = `fabric-canvas-${partName}`;
        const activeCanvas = document.getElementById(activeCanvasId);

        if (activeCanvas) {
            // Move to viewer container if not already there
            if (activeCanvas.parentElement !== viewerContainer) {
                viewerContainer.appendChild(activeCanvas);

                // Style the canvas for debug view
                activeCanvas.style.position = 'absolute';
                activeCanvas.style.bottom = '20px';
                activeCanvas.style.right = '20px';
                activeCanvas.style.width = '400px';
                activeCanvas.style.height = '400px';
                activeCanvas.style.border = '3px solid #ff0000';
                activeCanvas.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
                activeCanvas.style.zIndex = '1000';
                activeCanvas.style.pointerEvents = 'none';
                activeCanvas.style.backgroundColor = '#ffffff';
            }

            activeCanvas.style.display = 'block';
            activeCanvas.setAttribute('data-debug', 'true');

            // Mark the canvas-container wrapper as debug so it's visible
            const container = activeCanvas.closest('.canvas-container');
            if (container) {
                container.setAttribute('data-debug', 'true');
                container.style.display = 'block';
                container.style.position = 'absolute';
                container.style.inset = 'auto'; // Override Fabric.js default inset
                container.style.bottom = '20px';
                container.style.right = '20px';
                container.style.width = '400px';
                container.style.height = '400px';
                container.style.zIndex = '1000';
            }
        }

        // Update debug label
        const debugLabel = document.getElementById('fabric-debug-label');
        if (debugLabel) {
            debugLabel.textContent = `Debug: ${partName.toUpperCase()}`;
        }

        debugLog(`🐛 DEBUG: Switched to "${partName}" canvas`);
    }

    // Setup 3D logo interaction with raycasting
    setupLogoInteraction() {
        const canvas = this.renderer.domElement;

        canvas.addEventListener('mousedown', (event) => this.onLogoMouseDown(event));
        canvas.addEventListener('mousemove', (event) => this.onLogoMouseMove(event));
        canvas.addEventListener('mouseup', (event) => this.onLogoMouseUp(event));

        debugLog('🎯 3D logo interaction enabled (raycasting)');
    }

    // Handle mouse down for logo dragging
    onLogoMouseDown(event) {
        // Calculate mouse position in normalized device coordinates (-1 to +1)
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Update raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check for intersections with 3D model
        if (!this.current3DObject) return;

        const intersects = this.raycaster.intersectObject(this.current3DObject, true);

        if (intersects.length > 0) {
            const intersection = intersects[0];
            const materialName = intersection.object.material?.name || '';

            // Skip excluded materials (stitches)
            if (this.shouldExcludeMaterial(intersection.object.material)) {
                return;
            }

            // Get the part name from material
            const partName = this.materialToPartMap[materialName];

            if (partName && intersection.uv) {
                debugLog(`🎯 Clicked on "${partName}" (material: "${materialName}")`);

                // Get the canvas for this part
                const fabricCanvas = this.partCanvases[partName];
                if (!fabricCanvas) return;

                // Convert UV to canvas coordinates
                const clickPositionCanvas = {
                    x: intersection.uv.x * 2048,
                    y: intersection.uv.y * 2048
                };

                // Try to get active object, or find the logo on this canvas
                let activeObject = fabricCanvas.getActiveObject();
                let wasJustActivated = false;

                // If no active object, look for the logo (not the base design)
                if (!activeObject) {
                    const objects = fabricCanvas.getObjects();

                    // Find logo object that contains the click point
                    for (let i = objects.length - 1; i >= 0; i--) {
                        const obj = objects[i];
                        if (obj.type === 'image' && i > 0) {
                            if (obj.containsPoint({ x: clickPositionCanvas.x, y: clickPositionCanvas.y })) {
                                activeObject = obj;
                                fabricCanvas.setActiveObject(activeObject);
                                fabricCanvas.renderAll();
                                // Update texture to show selection borders
                                this.updateTexture(partName);
                                wasJustActivated = true;
                                debugLog(`✨ Selected logo on "${partName}" - click again to drag`);
                                break;
                            }
                        }
                    }
                }

                // Check if we have an active logo object
                if (activeObject && activeObject.type === 'image') {
                    // If logo was just activated, don't start dragging yet
                    if (wasJustActivated) {
                        return; // Exit early - user needs to click again to drag
                    }

                    // Check if click is on delete or clone control
                    if (activeObject.controls.deleteControl && activeObject.controls.cloneControl) {
                        const deleteControl = activeObject.controls.deleteControl;
                        const cloneControl = activeObject.controls.cloneControl;
                        const angle = activeObject.angle * Math.PI / 180;
                        const objectCenter = activeObject.getCenterPoint();

                        // Calculate delete icon position with rotation
                        const deleteOffsetX = (deleteControl.x * activeObject.width * activeObject.scaleX) + deleteControl.offsetX;
                        const deleteOffsetY = (deleteControl.y * activeObject.height * activeObject.scaleY) + deleteControl.offsetY;
                        const rotatedDeleteX = deleteOffsetX * Math.cos(angle) - deleteOffsetY * Math.sin(angle);
                        const rotatedDeleteY = deleteOffsetX * Math.sin(angle) + deleteOffsetY * Math.cos(angle);
                        const deleteIconLeft = objectCenter.x + rotatedDeleteX;
                        const deleteIconTop = objectCenter.y + rotatedDeleteY;

                        // Calculate clone icon position with rotation
                        const cloneOffsetX = (cloneControl.x * activeObject.width * activeObject.scaleX) + cloneControl.offsetX;
                        const cloneOffsetY = (cloneControl.y * activeObject.height * activeObject.scaleY) + cloneControl.offsetY;
                        const rotatedCloneX = cloneOffsetX * Math.cos(angle) - cloneOffsetY * Math.sin(angle);
                        const rotatedCloneY = cloneOffsetX * Math.sin(angle) + cloneOffsetY * Math.cos(angle);
                        const cloneIconLeft = objectCenter.x + rotatedCloneX;
                        const cloneIconTop = objectCenter.y + rotatedCloneY;

                        const iconSize = deleteControl.cornerSize || 24;

                        // Check if click is on delete icon
                        if (clickPositionCanvas.x >= deleteIconLeft - iconSize / 2 &&
                            clickPositionCanvas.x <= deleteIconLeft + iconSize / 2 &&
                            clickPositionCanvas.y >= deleteIconTop - iconSize / 2 &&
                            clickPositionCanvas.y <= deleteIconTop + iconSize / 2) {
                            // Click is on delete icon
                            debugLog(`🗑️ Delete icon clicked`);
                            fabricCanvas.remove(activeObject);
                            fabricCanvas.renderAll();
                            this.updateTexture(partName);
                            return; // Exit early to prevent dragging
                        }
                        // Check if click is on clone icon
                        else if (clickPositionCanvas.x >= cloneIconLeft - iconSize / 2 &&
                            clickPositionCanvas.x <= cloneIconLeft + iconSize / 2 &&
                            clickPositionCanvas.y >= cloneIconTop - iconSize / 2 &&
                            clickPositionCanvas.y <= cloneIconTop + iconSize / 2) {
                            // Click is on clone icon
                            debugLog(`📋 Clone icon clicked`);
                            activeObject.clone((cloned) => {
                                // Copy all visual and control properties from original
                                cloned.set({
                                    left: cloned.left + 40,
                                    top: cloned.top + 40,
                                    // Copy styling properties
                                    cornerSize: activeObject.cornerSize,
                                    transparentCorners: activeObject.transparentCorners,
                                    cornerColor: activeObject.cornerColor,
                                    borderColor: activeObject.borderColor,
                                    cornerStyle: activeObject.cornerStyle,
                                    centeredScaling: activeObject.centeredScaling,
                                    padding: activeObject.padding,
                                    selectable: activeObject.selectable,
                                    hasControls: activeObject.hasControls,
                                    hasBorders: activeObject.hasBorders
                                });

                                // Copy control visibility settings
                                cloned.setControlsVisibility({
                                    mt: false,    // middle top
                                    mb: false,    // middle bottom
                                    ml: false,    // middle left
                                    mr: false,    // middle right
                                    mtr: false    // disable rotation control
                                });

                                // Copy custom controls (delete and clone)
                                cloned.controls.deleteControl = activeObject.controls.deleteControl;
                                cloned.controls.cloneControl = activeObject.controls.cloneControl;

                                fabricCanvas.add(cloned);
                                fabricCanvas.setActiveObject(cloned);
                                fabricCanvas.renderAll();
                                this.updateTexture(partName);
                            });
                            return; // Exit early to prevent dragging
                        }
                    }

                    // Logo is already selected, now enable dragging
                    this.isDragging = true;
                    this.draggedPart = partName;

                    // Disable orbit controls during drag
                    if (this.controls) {
                        this.controls.enabled = false;
                    }

                    debugLog(`🎯 Started dragging logo on "${partName}"`);

                    // Update logo position
                    this.updateLogoPositionFromUV(partName, intersection.uv, activeObject);
                } else {
                    debugLog(`📍 UV coordinates: (${intersection.uv.x.toFixed(3)}, ${intersection.uv.y.toFixed(3)})`);
                    debugLog(`ℹ️ No logo found on "${partName}"`);
                }
            }
        } else {
            // No intersection with 3D model - deselect all logos to allow OrbitControls
            debugLog(`🔄 Clicked outside 3D model - deselecting logos`);

            // Deselect active objects on all canvases and update textures
            Object.entries(this.partCanvases).forEach(([partName, canvas]) => {
                canvas.discardActiveObject();
                canvas.renderAll();
                // Update texture to remove selection borders from 3D model
                this.updateTexture(partName);
            });

            // Re-enable orbit controls
            if (this.controls) {
                this.controls.enabled = true;
            }
        }
    }

    // Handle mouse move for logo dragging
    onLogoMouseMove(event) {
        if (!this.isDragging || !this.draggedPart) return;

        // Calculate mouse position
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Update raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check for intersections
        if (!this.current3DObject) return;

        const intersects = this.raycaster.intersectObject(this.current3DObject, true);

        if (intersects.length > 0) {
            const intersection = intersects[0];
            const materialName = intersection.object.material?.name || '';
            const partName = this.materialToPartMap[materialName];

            // Only update if still on the same part
            if (partName === this.draggedPart && intersection.uv) {
                const fabricCanvas = this.partCanvases[partName];
                const activeObject = fabricCanvas?.getActiveObject();

                if (activeObject) {
                    this.updateLogoPositionFromUV(partName, intersection.uv, activeObject);
                }
            }
        }
    }

    // Handle mouse up to end dragging
    onLogoMouseUp(event) {
        if (this.isDragging) {
            debugLog(`✅ Logo drag complete on "${this.draggedPart}"`);

            // Re-enable orbit controls
            if (this.controls) {
                this.controls.enabled = true;
            }

            this.isDragging = false;
            this.draggedPart = null;
        }
    }

    // Update logo position based on UV coordinates
    updateLogoPositionFromUV(partName, uv, logoObject) {
        const fabricCanvas = this.partCanvases[partName];
        if (!fabricCanvas) return;

        // Convert UV (0-1) to canvas coordinates (0-2048)
        // UV origin is bottom-left, canvas origin is top-left
        const canvasX = uv.x * 2048;
        const canvasY = uv.y * 2048;

        // Update logo position (center it on click point)
        logoObject.set({
            left: canvasX,
            top: canvasY
        });

        fabricCanvas.renderAll();
        this.updateTexture(partName);

        debugLog(`📍 Logo moved to canvas position: (${canvasX.toFixed(0)}, ${canvasY.toFixed(0)})`);
    }

    createDebugGUI() {
        // Create lil-gui panel for debug controls
        const gui = new lil.GUI({
            title: 'Debug Controls',
            autoPlace: false  // Disable auto-placement
        });

        // Position the GUI to the left of the fabric canvas
        gui.domElement.style.position = 'absolute';
        gui.domElement.style.width = '400px';
        gui.domElement.style.top = '400px';
        gui.domElement.style.left = '0px';
        gui.domElement.style.zIndex = '1000';

        // Append to viewer container
        const viewerContainer = document.querySelector('.viewer-container');
        if (viewerContainer) {
            viewerContainer.appendChild(gui.domElement);
        }

        // ========== LIGHTING CONTROLS FOLDER ==========
        const lightingControlsFolder = gui.addFolder('Lighting Controls');

        // Environment Lighting subfolder
        const envFolder = lightingControlsFolder.addFolder('Environment Lighting');

        // Tone mapping options
        const toneMappingOptions = {
            'No Tone Mapping': THREE.NoToneMapping,
            'Linear': THREE.LinearToneMapping,
            'Reinhard': THREE.ReinhardToneMapping,
            'Cineon': THREE.CineonToneMapping,
            'ACES Filmic': THREE.ACESFilmicToneMapping
        };

        const envSettings = {
            toneMapping: 'No Tone Mapping',
            exposure: this.renderer.toneMappingExposure,
            envIntensity: 1.0,
            aoIntensity: 1.0
        };

        envFolder.add(envSettings, 'toneMapping', Object.keys(toneMappingOptions))
            .name('Tone Mapping')
            .onChange((value) => {
                this.renderer.toneMapping = toneMappingOptions[value];
            });

        envFolder.add(envSettings, 'exposure', 0, 3, 0.1)
            .name('Exposure')
            .onChange((value) => {
                this.renderer.toneMappingExposure = value;
                debugLog('📸 Exposure changed to:', value);
                // Force material updates
                if (this.current3DObject) {
                    this.current3DObject.traverse((child) => {
                        if (child.isMesh && child.material) {
                            child.material.needsUpdate = true;
                        }
                    });
                }
            });

        envFolder.add(envSettings, 'envIntensity', 0, 3, 0.1)
            .name('Environment Intensity')
            .onChange((value) => {
                if (this.scene.environment) {
                    this.scene.environmentIntensity = value;
                    debugLog('🌍 Environment intensity changed to:', value);
                }
            });

        envFolder.add(envSettings, 'aoIntensity', 0, 2, 0.1)
            .name('AO Intensity')
            .onChange((value) => {
                debugLog('🎨 AO intensity changed to:', value);
                if (this.current3DObject) {
                    this.current3DObject.traverse((child) => {
                        if (child.isMesh && child.material && child.material.aoMap) {
                            child.material.aoMapIntensity = value;
                            child.material.needsUpdate = true;
                        }
                    });
                }
            });

        // Add ground shadow control
        const groundSettings = {
            shadowOpacity: 1.0
        };

        envFolder.add(groundSettings, 'shadowOpacity', 0, 1, 0.05)
            .name('Ground Shadow')
            .onChange((value) => {
                debugLog('🌑 Ground shadow opacity changed to:', value);
                if (this.groundPlane && this.groundPlane.material) {
                    this.groundPlane.material.opacity = value;
                }
            });

        // Light Intensities subfolder
        const lightingFolder = lightingControlsFolder.addFolder('Light Intensities');
        lightingFolder.add(this.ambientLight, 'intensity', 0, 3, 0.1).name('Ambient');
        lightingFolder.add(this.keyLight, 'intensity', 0, 3, 0.1).name('Key Light');
        lightingFolder.add(this.fillLight, 'intensity', 0, 3, 0.1).name('Fill Light');
        lightingFolder.add(this.backLight, 'intensity', 0, 3, 0.1).name('Back Light');

        // Lighting Rotation subfolder
        const rotationFolder = lightingControlsFolder.addFolder('Lighting Rotation');
        const rotationControl = {
            rotationY: (this.lightsContainer.rotation.y * 180 / Math.PI) % 360
        };
        rotationFolder.add(rotationControl, 'rotationY', 0, 360, 1)
            .name('Y Rotation (°)')
            .onChange((value) => {
                this.lightsContainer.rotation.y = value * Math.PI / 180;
            });

        // ========== CAMERA CONTROLS FOLDER ==========
        const cameraFolder = gui.addFolder('Camera Controls');

        // Camera position tracking (live updates)
        const cameraPosition = {
            x: '0.00',
            y: '0.00',
            z: '0.00',
            copyPosition: () => {
                const pos = {
                    x: parseFloat(this.camera.position.x.toFixed(2)),
                    y: parseFloat(this.camera.position.y.toFixed(2)),
                    z: parseFloat(this.camera.position.z.toFixed(2))
                };
                const posString = JSON.stringify(pos, null, 2);
                navigator.clipboard.writeText(posString).then(() => {
                    debugLog('📋 Camera position copied to clipboard:', posString);
                    alert('Camera position copied to clipboard!');
                }).catch(err => {
                    console.error('Failed to copy:', err);
                });
            }
        };

        // Add read-only position displays
        cameraFolder.add(cameraPosition, 'x').name('Position X').listen().disable();
        cameraFolder.add(cameraPosition, 'y').name('Position Y').listen().disable();
        cameraFolder.add(cameraPosition, 'z').name('Position Z').listen().disable();

        // Add copy button
        cameraFolder.add(cameraPosition, 'copyPosition').name('📋 Copy Position');

        // Update camera position every frame
        const updateCameraPosition = () => {
            cameraPosition.x = this.camera.position.x.toFixed(2);
            cameraPosition.y = this.camera.position.y.toFixed(2);
            cameraPosition.z = this.camera.position.z.toFixed(2);
        };

        // Store the update function so we can call it in the render loop
        this.updateCameraPositionDebug = updateCameraPosition;

        cameraFolder.add(this, 'cameraResetDuration', 500, 2500, 50)
            .name('Reset Duration (ms)')
            .onChange((value) => {
                debugLog(`⏱️ Camera reset duration changed to: ${value}ms`);
            });

        // ========== PERFORMANCE MONITOR FOLDER ==========
        const perfFolder = gui.addFolder('Performance Monitor');

        // Memory stats object (will be updated periodically)
        const memoryStats = {
            usedMemory: '0 MB',
            totalMemory: '0 MB',
            memoryLimit: '0 MB',
            canvasCount: 6,
            canvasSize: '2048x2048'
        };

        // Add read-only displays
        perfFolder.add(memoryStats, 'usedMemory').name('Used Memory').listen().disable();
        perfFolder.add(memoryStats, 'totalMemory').name('Total Memory').listen().disable();
        perfFolder.add(memoryStats, 'memoryLimit').name('Memory Limit').listen().disable();
        perfFolder.add(memoryStats, 'canvasCount').name('Canvas Count').listen().disable();
        perfFolder.add(memoryStats, 'canvasSize').name('Canvas Size').listen().disable();

        // Update memory stats every second
        setInterval(() => {
            if (performance.memory) {
                memoryStats.usedMemory = (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB';
                memoryStats.totalMemory = (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB';
                memoryStats.memoryLimit = (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB';
            } else {
                memoryStats.usedMemory = 'N/A (Chrome only)';
                memoryStats.totalMemory = 'N/A';
                memoryStats.memoryLimit = 'N/A';
            }
        }, 1000);

        debugLog('🎛️ Debug GUI created with organized folder structure');
    }

    // Helper function to update texture on current 3D object
    // partName: optional, if specified only update that part's texture
    updateTexture(partName = null) {
        if (!this.current3DObject) {
            console.warn('No 3D object loaded yet');
            return;
        }

        // If partName specified, update only that part's texture
        if (partName) {
            const texture = this.partTextures[partName];
            if (!texture) {
                console.error(`Texture not found for part: ${partName}`);
                return;
            }

            texture.needsUpdate = true;

            // Update only meshes that belong to this part
            this.current3DObject.traverse((child) => {
                if (child.isMesh && child.material) {
                    // Skip stitch materials
                    if (this.shouldExcludeMaterial(child.material)) {
                        return;
                    }

                    // Check if this material belongs to the specified part
                    const materialName = child.material.name;
                    const mappedPart = this.materialToPartMap[materialName];

                    if (mappedPart === partName) {
                        child.material.map = texture;
                        child.material.map.needsUpdate = true;
                        child.material.needsUpdate = true;
                        debugLog(`✅ Updated texture for "${materialName}" → "${partName}"`);
                    }
                }
            });

            debugLog(`Texture updated for part: ${partName}`);
        } else {
            // Update all parts' textures
            Object.keys(this.partTextures).forEach(part => {
                this.updateTexture(part);
            });
        }
    }

    // Helper to adjust canvas size based on SVG complexity
    adjustCanvasSize(svgPath) {
        // Use consistent 2048x2048 for all SVGs to ensure full texture coverage
        // The pre-rasterization optimization provides performance benefits
        // without needing to reduce canvas size
        debugLog('📐 Using consistent 2048x2048 canvas for full texture coverage');
        return 2048;
    }

    // Load SVG design onto Fabric canvas (OPTIMIZED with pre-rasterization)
    loadSVGDesign(svgPath) {
        debugLog('Loading SVG design:', svgPath);
        const startTime = performance.now();

        // Adjust canvas size based on SVG complexity BEFORE loading
        const canvasSize = this.adjustCanvasSize(svgPath);

        // Create an image element to load the SVG
        const imgElement = new Image();
        imgElement.crossOrigin = 'anonymous';

        imgElement.onload = () => {
            const loadTime = performance.now() - startTime;
            debugLog(`✅ SVG loaded in ${loadTime.toFixed(0)}ms, rasterizing to PNG...`);
            const processStart = performance.now();

            // Rasterize SVG to canvas at target resolution ONCE
            // This is the KEY OPTIMIZATION - convert vector to raster ONCE and reuse
            const rasterCanvas = document.createElement('canvas');
            // Use the first canvas size as reference (all canvases are same size)
            const referenceCanvas = this.partCanvases['front'];
            rasterCanvas.width = referenceCanvas.width;
            rasterCanvas.height = referenceCanvas.height;
            const ctx = rasterCanvas.getContext('2d');

            // Fill with white background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, rasterCanvas.width, rasterCanvas.height);

            // Draw SVG image at full canvas resolution
            ctx.drawImage(imgElement, 0, 0, rasterCanvas.width, rasterCanvas.height);

            // Convert rasterized canvas to data URL ONCE
            const dataUrl = rasterCanvas.toDataURL('image/png');

            debugLog('🎨 Applying design to all canvases simultaneously...');

            // Counter to track completion
            let loadedCount = 0;
            const totalParts = Object.keys(this.partCanvases).length;

            // Load the same rasterized PNG into all Fabric canvases
            Object.entries(this.partCanvases).forEach(([partName, fabricCanvas]) => {
                fabric.Image.fromURL(dataUrl, (img) => {
                    if (!img) {
                        console.error(`Failed to create Fabric image for ${partName}`);
                        return;
                    }

                    // Save existing logos and stripes before clearing
                    const existingLogos = fabricCanvas.getObjects().filter(obj =>
                        obj.type === 'image' && obj.name === 'logoLayer'
                    );
                    const existingStripes = fabricCanvas.getObjects().filter(obj =>
                        obj.name && obj.name.startsWith('stripeLayer')
                    );

                    // Clear existing content from this canvas (except logos and stripes)
                    fabricCanvas.getObjects().forEach(obj => {
                        // Don't remove logo objects or stripe objects
                        const isLogo = obj.type === 'image' && obj.name === 'logoLayer';
                        const isStripe = obj.name && obj.name.startsWith('stripeLayer');
                        if (!isLogo && !isStripe) {
                            fabricCanvas.remove(obj);
                            if (obj.dispose) obj.dispose();
                        }
                    });

                    // Clear background but keep logos and stripes
                    fabricCanvas.backgroundColor = '#ffffff';

                    // Scale image to exact canvas dimensions
                    img.scaleToWidth(fabricCanvas.width);
                    img.scaleToHeight(fabricCanvas.height);

                    // Set origin to center
                    img.set({
                        originX: 'center',
                        originY: 'center'
                    });

                    // Add the design image first (so stripes and logos appear on top)
                    fabricCanvas.add(img);
                    fabricCanvas.sendToBack(img); // Send design to back
                    fabricCanvas.centerObject(img);

                    // Ensure correct layer order: design -> stripes -> logos
                    existingStripes.forEach(stripe => {
                        stripe.moveTo(1); // Stripes above design
                    });
                    existingLogos.forEach(logo => {
                        logo.bringToFront(); // Logos on top
                    });

                    fabricCanvas.renderAll();

                    // Update the 3D texture for this part
                    this.updateTexture(partName);


                    loadedCount++;
                    debugLog(`✅ Design loaded on "${partName}" canvas (${loadedCount}/${totalParts})`);

                    // Log completion when all parts are done
                    if (loadedCount === totalParts) {
                        const totalTime = performance.now() - startTime;
                        const processTime = performance.now() - processStart;
                        debugLog(`🎨 SVG rasterized and rendered in ${processTime.toFixed(0)}ms`);
                        debugLog(`⚡ Total time: ${totalTime.toFixed(0)}ms - Design applied to all ${totalParts} parts`);
                    }
                }, { crossOrigin: 'anonymous' });
            });
        };

        imgElement.onerror = () => {
            console.error('❌ Error loading SVG:', svgPath);
        };

        imgElement.src = svgPath;
    }

    // ==================== STRIPE GENERATION METHODS ====================

    /**
     * Get the stripe layer configuration for the currently selected part
     * @returns {Object} The stripe layers object for the current part
     */
    getCurrentPartStripeLayers() {
        const partSelect = document.getElementById('jersey-part-select-colors');
        const selectedPart = partSelect ? partSelect.value : 'front';
        return this.stripeLayersByPart[selectedPart];
    }

    /**
     * Update all stripe UI controls to reflect the current part's configuration
     */
    updateStripeUIForCurrentPart() {
        const partSelect = document.getElementById('jersey-part-select-colors');
        const selectedPart = partSelect ? partSelect.value : 'front';
        const partConfig = this.stripeLayersByPart[selectedPart];

        debugLog(`🔄 Updating stripe UI for part: ${selectedPart}`);

        // Update all 4 tabs
        ['tab1', 'tab2', 'tab3', 'tab4'].forEach(tabId => {
            const config = partConfig[tabId];

            // Update count dropdown
            const countSelect = document.getElementById(`jersey-stripes-select-${tabId}`);
            if (countSelect) countSelect.value = config.count;

            // Update color picker
            const colorInput = document.getElementById(`jersey-stripes-color-${tabId}`);
            if (colorInput) colorInput.value = config.color;

            // Update position slider
            const positionSlider = document.getElementById(`jersey-stripes-position-${tabId}`);
            if (positionSlider) positionSlider.value = config.position;

            // Update gap slider
            const gapSlider = document.getElementById(`jersey-stripes-gap-${tabId}`);
            if (gapSlider) gapSlider.value = config.gap;

            // Update thickness slider
            const thicknessSlider = document.getElementById(`jersey-stripes-thickness-${tabId}`);
            if (thicknessSlider) thicknessSlider.value = config.thickness;
        });

        debugLog(`✅ Stripe UI updated for ${selectedPart}`);
    }


    /**
     * Generate stripes for the currently selected part based on the specified tab configuration
     * @param {string} tabId - The tab identifier (tab1, tab2, tab3, tab4)
     */
    generateStripesForSelectedPart(tabId) {
        // Get the currently selected part from the dropdown
        const partSelect = document.getElementById('jersey-part-select-colors');
        if (!partSelect) {
            console.error('Part select dropdown not found');
            return;
        }

        const selectedPart = partSelect.value;
        debugLog(`🎨 Generating stripes for selected part: ${selectedPart} - Layer: ${tabId}`);
        const startTime = performance.now();

        // Get stripe configuration for this tab from the current part
        const config = this.getCurrentPartStripeLayers()[tabId];
        if (!config) {
            console.error(`Invalid tab ID: ${tabId}`);
            return;
        }

        // Get the canvas for the selected part
        const fabricCanvas = this.partCanvases[selectedPart];
        if (!fabricCanvas) {
            console.error(`Canvas not found for part: ${selectedPart}`);
            return;
        }

        // Apply stripes to the selected part's canvas
        this.generateStripesForCanvas(fabricCanvas, selectedPart, tabId);

        const totalTime = performance.now() - startTime;
        debugLog(`✅ Stripes generated for ${selectedPart} in ${totalTime.toFixed(0)}ms`);
    }

    /**
     * Generate stripes for a single canvas
     * @param {fabric.Canvas} fabricCanvas - The Fabric.js canvas
     * @param {string} partName - The part name (front, back, etc.)
     * @param {string} tabId - The tab identifier (tab1, tab2, tab3, tab4)
     */
    generateStripesForCanvas(fabricCanvas, partName, tabId) {
        const config = this.stripeLayersByPart[partName][tabId];
        const layerName = `stripeLayer${tabId.replace('tab', '')}`;

        // Clear existing stripes for this layer
        this.clearStripesLayer(fabricCanvas, layerName);

        // If count is 0, just clear and return
        if (config.count === 0) {
            fabricCanvas.renderAll();
            this.updateTexture(partName);
            return;
        }

        // Get bounding box for this part
        const bbox = this.partBoundingBoxes[partName] || this.partBoundingBoxes['front'];
        debugLog(`📦 Using bounding box for ${partName}:`, bbox);

        // Create stripe rectangles with bounding box
        const stripes = this.createStripeRectangles(
            this.stripeOrientation,
            config.count,
            config.thickness,
            config.gap,
            config.color,
            config.position,
            layerName,
            bbox
        );

        // Add stripes to canvas
        stripes.forEach(stripe => {
            fabricCanvas.add(stripe);
            // Send stripes behind logos but above base design
            stripe.moveTo(1); // Position 0 is the base design, position 1+ are stripes
        });

        // Ensure logos stay on top
        const objects = fabricCanvas.getObjects();
        objects.forEach(obj => {
            if (obj.type === 'image' && obj.name === 'logoLayer') {
                obj.bringToFront();
            }
        });

        fabricCanvas.renderAll();
        this.updateTexture(partName);

        debugLog(`✅ Stripes added to \"${partName}\" - Layer: ${layerName}, Count: ${config.count}`);
    }

    /**
     * Clear all stripes of a specific layer from a canvas
     * @param {fabric.Canvas} fabricCanvas - The Fabric.js canvas
     * @param {string} layerName - The layer name to clear (e.g., 'stripeLayer1')
     */
    clearStripesLayer(fabricCanvas, layerName) {
        const objectsToRemove = fabricCanvas.getObjects().filter(obj => obj.name === layerName);
        objectsToRemove.forEach(obj => {
            fabricCanvas.remove(obj);
            if (obj.dispose) obj.dispose();
        });
    }

    /**
     * Create stripe rectangle objects (adapted from sock configurator)
     * @param {string} orientation - 'horizontal' or 'vertical'
     * @param {number} numStripes - Number of stripes to create
     * @param {number} stripeThickness - Thickness of each stripe (in units)
     * @param {number} stripeGap - Gap between stripes (in units)
     * @param {string} stripeColor - Color of the stripes (hex or rgb)
     * @param {number} stripesOffsetTop - Offset from top/left (in units)
     * @param {string} layerName - Name for the stripe layer
     * @returns {Array} Array of Fabric.js rectangle objects
     */
    createStripeRectangles(orientation, numStripes, stripeThickness, stripeGap, stripeColor, stripesOffsetTop, layerName, bbox = null) {
        const stripes = [];
        const canvasWidth = 2048;  // Jersey canvas size
        const canvasHeight = 2048;

        // Convert units to pixels (multiply by 10 for scaling)
        const thickness = stripeThickness * 10;
        const gap = stripeGap * 10;
        const offset = stripesOffsetTop * 10;

        // Use bounding box coordinates if provided, otherwise use legacy values
        let startX = 0;
        let startY = canvasHeight - 400; // Legacy default
        let bboxWidth = canvasWidth;
        let bboxHeight = canvasHeight;

        if (bbox) {
            // Convert normalized bbox coordinates (0-1) to pixel coordinates
            startX = bbox.x * canvasWidth;
            startY = bbox.y * canvasHeight;
            bboxWidth = bbox.width * canvasWidth;
            bboxHeight = bbox.height * canvasHeight;
            debugLog(`📍 Stripe positioning: startX=${startX.toFixed(0)}, startY=${startY.toFixed(0)}, width=${bboxWidth.toFixed(0)}, height=${bboxHeight.toFixed(0)}`);
        }

        if (orientation === 'horizontal') {
            // Horizontal stripes
            const effectiveGap = gap + thickness;

            for (let i = 0; i < numStripes; i++) {
                const stripe = new fabric.Rect({
                    left: startX + (bboxWidth / 2),
                    top: startY + offset + (i * effectiveGap),
                    width: bboxWidth * 1.5, // Extra wide to cover the part
                    height: thickness,
                    fill: stripeColor,
                    selectable: false,
                    evented: false,
                    originX: 'center',
                    originY: 'top',
                    name: layerName
                });

                stripes.push(stripe);
            }
        } else {
            // Vertical stripes
            const numStripesVertical = (numStripes === 0) ? 0 : Math.ceil((bboxWidth + gap) / (thickness + gap));

            for (let i = 0; i < numStripesVertical; i++) {
                const stripe = new fabric.Rect({
                    left: startX + offset + (i * (thickness + gap)),
                    top: startY + (bboxHeight / 2),
                    width: thickness,
                    height: bboxHeight * 1.5, // Extra tall to cover the part
                    fill: stripeColor,
                    selectable: false,
                    evented: false,
                    originX: 'left',
                    originY: 'center',
                    name: layerName
                });

                stripes.push(stripe);
            }
        }

        return stripes;
    }

    /**
     * Setup event listeners for stripe controls
     */
    setupStripeControls() {
        debugLog('🎛️ Setting up stripe controls...');

        // Stripe orientation
        const orientationRadios = document.querySelectorAll('input[name="jersey-orientation"]');
        orientationRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.stripeOrientation = e.target.value;
                debugLog(`🔄 Stripe orientation changed to: ${this.stripeOrientation}`);

                // Regenerate all active stripe layers for selected part
                ['tab1', 'tab2', 'tab3', 'tab4'].forEach(tabId => {
                    if (this.getCurrentPartStripeLayers()[tabId].count > 0) {
                        this.generateStripesForSelectedPart(tabId);
                    }
                });
            });
        });

        // Setup controls for each tab
        ['tab1', 'tab2', 'tab3', 'tab4'].forEach(tabId => {
            // Stripe count
            const countSelect = document.getElementById(`jersey-stripes-select-${tabId}`);
            if (countSelect) {
                countSelect.addEventListener('change', (e) => {
                    this.getCurrentPartStripeLayers()[tabId].count = parseInt(e.target.value);
                    debugLog(`📊 ${tabId} stripe count: ${this.getCurrentPartStripeLayers()[tabId].count}`);
                    this.generateStripesForSelectedPart(tabId);
                });
            }

            // Stripe color
            const colorInput = document.getElementById(`jersey-stripes-color-${tabId}`);
            if (colorInput) {
                colorInput.addEventListener('input', (e) => {
                    this.getCurrentPartStripeLayers()[tabId].color = e.target.value;
                    debugLog(`🎨 ${tabId} stripe color: ${this.getCurrentPartStripeLayers()[tabId].color}`);
                    this.generateStripesForSelectedPart(tabId);
                });
            }

            // Stripe position
            const positionInput = document.getElementById(`jersey-stripes-position-${tabId}`);
            if (positionInput) {
                positionInput.addEventListener('input', (e) => {
                    this.getCurrentPartStripeLayers()[tabId].position = parseFloat(e.target.value);
                    debugLog(`📍 ${tabId} stripe position: ${this.getCurrentPartStripeLayers()[tabId].position}`);
                    this.generateStripesForSelectedPart(tabId);
                });
            }

            // Stripe gap
            const gapInput = document.getElementById(`jersey-stripes-gap-${tabId}`);
            if (gapInput) {
                gapInput.addEventListener('input', (e) => {
                    this.getCurrentPartStripeLayers()[tabId].gap = parseFloat(e.target.value);
                    debugLog(`↔️ ${tabId} stripe gap: ${this.getCurrentPartStripeLayers()[tabId].gap}`);
                    this.generateStripesForSelectedPart(tabId);
                });
            }

            // Stripe thickness
            const thicknessInput = document.getElementById(`jersey-stripes-thickness-${tabId}`);
            if (thicknessInput) {
                thicknessInput.addEventListener('input', (e) => {
                    this.getCurrentPartStripeLayers()[tabId].thickness = parseFloat(e.target.value);
                    debugLog(`📏 ${tabId} stripe thickness: ${this.getCurrentPartStripeLayers()[tabId].thickness}`);
                    this.generateStripesForSelectedPart(tabId);
                });
            }
        });

        debugLog('✅ Stripe controls setup complete');
    }

    /**
     * Initialize default stripes (called when switching to Colors & Stripes tab)
     */
    initializeDefaultStripes() {
        debugLog('🎨 Initializing default stripes...');

        // Generate default stripes for tab1 (count: 1) on the selected part
        if (this.getCurrentPartStripeLayers().tab1.count > 0) {
            this.generateStripesForSelectedPart('tab1');
        }
    }


    // Load uploaded logo image onto Fabric canvas
    readLogo(publicUrl) {
        debugLog('📸 Loading uploaded logo:', publicUrl);
        const startTime = performance.now();

        // Get selected jersey part from dropdown
        const partSelect = document.getElementById('jersey-part-select-working') ||
            document.getElementById('jersey-part-select');
        const selectedPart = partSelect ? partSelect.value : 'front';
        this.currentPart = selectedPart;

        // Get the canvas for the selected part
        const fabricCanvas = this.partCanvases[this.currentPart];
        if (!fabricCanvas) {
            console.error(`Canvas not found for part: ${this.currentPart}`);
            return;
        }

        // Get bounding box for selected part
        const bbox = this.partBoundingBoxes[this.currentPart] || this.partBoundingBoxes['front'];

        debugLog(`📍 Adding logo to "${this.currentPart}" canvas at bbox:`, bbox);

        // Use Fabric.js Image.fromURL to load the logo
        fabric.Image.fromURL(publicUrl, (img) => {
            if (!img) {
                console.error('❌ Failed to load logo image');
                return;
            }

            debugLog('✅ Logo image loaded successfully');

            // DON'T clear canvas - add logo as a new layer on top
            debugLog('➕ Adding logo as a new layer on top of existing design...');

            // Scale logo to fit canvas while maintaining aspect ratio
            const canvasWidth = fabricCanvas.width;
            const canvasHeight = fabricCanvas.height;
            const imgWidth = img.width;
            const imgHeight = img.height;

            // Calculate available space within the bounding box
            const bboxWidth = canvasWidth * bbox.width;
            const bboxHeight = canvasHeight * bbox.height;

            // Calculate scale to fit within bounding box (max 80% of bbox size)
            const maxWidth = bboxWidth * 0.8;
            const maxHeight = bboxHeight * 0.8;
            const scaleX = maxWidth / imgWidth;
            const scaleY = maxHeight / imgHeight;
            const scale = Math.min(scaleX, scaleY);

            // Calculate position at center of bounding box
            const bboxCenterX = canvasWidth * (bbox.x + bbox.width / 2);
            const bboxCenterY = canvasHeight * (bbox.y + bbox.height / 2);

            // Apply scaling and position at bbox center with enhanced styling
            img.set({
                scaleX: scale,
                scaleY: scale,
                originX: 'center',
                originY: 'center',
                left: bboxCenterX,
                top: bboxCenterY,
                selectable: true,
                hasControls: true,
                hasBorders: true,
                // Enhanced styling from previous project
                cornerSize: 10,
                transparentCorners: false,
                cornerColor: 'blue',
                borderColor: 'blue',
                cornerStyle: 'circle',
                centeredScaling: true,
                padding: 5,
                name: "logoLayer"
            });

            // Enable uniform scaling (maintain aspect ratio)
            // Disable middle handles and rotation to prevent distortion
            img.setControlsVisibility({
                mt: false,    // middle top
                mb: false,    // middle bottom
                ml: false,    // middle left
                mr: false,    // middle right
                mtr: false    // disable rotation control (we'll use custom controls)
            });

            // Add custom delete control
            img.controls.deleteControl = new fabric.Control({
                x: 0.5,
                y: 0.0,
                offsetY: 0,
                offsetX: 48,
                cursorStyle: 'pointer',
                mouseUpHandler: this.deleteLogoObject.bind(this),
                render: this.renderDeleteIcon.bind(this),
                cornerSize: 72,
            });

            // Add custom clone control
            img.controls.cloneControl = new fabric.Control({
                x: -0.5,
                y: 0.0,
                offsetY: 0,
                offsetX: -48,
                cursorStyle: 'pointer',
                mouseUpHandler: this.cloneLogoObject.bind(this),
                render: this.renderCloneIcon.bind(this),
                cornerSize: 72,
            });

            debugLog(`📏 Logo scaled by ${scale.toFixed(2)}x and centered at (${bboxCenterX.toFixed(0)}, ${bboxCenterY.toFixed(0)}) on ${this.currentPart} canvas`);

            // Add logo to canvas as a new layer
            fabricCanvas.add(img);
            fabricCanvas.setActiveObject(img);

            // Store reference to the logo for UI controls
            this.currentLogo = img;
            this.logoBaseScale = scale; // Store the initial scale for relative adjustments

            fabricCanvas.renderAll();

            // Update the 3D texture for this part
            this.updateTexture(this.currentPart);

            const totalTime = performance.now() - startTime;
            debugLog(`⚡ Logo added to ${this.currentPart} and applied to 3D model in ${totalTime.toFixed(0)}ms`);
        }, { crossOrigin: 'anonymous' });
    }

    // Load logo with saved configuration (position, scale, rotation)
    readLogoWithConfig(publicUrl, logoConfig, partName) {
        debugLog('📸 Loading logo with saved config:', publicUrl, logoConfig);
        const startTime = performance.now();

        // Get the canvas for the specified part
        const fabricCanvas = this.partCanvases[partName];
        if (!fabricCanvas) {
            console.error(`Canvas not found for part: ${partName}`);
            return;
        }

        // Use Fabric.js Image.fromURL to load the logo
        fabric.Image.fromURL(publicUrl, (img) => {
            if (!img) {
                console.error('❌ Failed to load logo image');
                return;
            }

            debugLog('✅ Logo image loaded successfully, applying saved configuration...');

            // Apply saved configuration directly
            img.set({
                left: logoConfig.left,
                top: logoConfig.top,
                scaleX: logoConfig.scaleX,
                scaleY: logoConfig.scaleY,
                angle: logoConfig.angle || 0,
                originX: logoConfig.originX || 'center',
                originY: logoConfig.originY || 'center',
                selectable: true,
                hasControls: true,
                hasBorders: true,
                // Enhanced styling
                cornerSize: 10,
                transparentCorners: false,
                cornerColor: 'blue',
                borderColor: 'blue',
                cornerStyle: 'circle',
                centeredScaling: true,
                padding: 5,
                name: "logoLayer"
            });

            // Enable uniform scaling (maintain aspect ratio)
            img.setControlsVisibility({
                mt: false,    // middle top
                mb: false,    // middle bottom
                ml: false,    // middle left
                mr: false,    // middle right
                mtr: false    // disable rotation control
            });

            // Add custom delete control
            img.controls.deleteControl = new fabric.Control({
                x: 0.5,
                y: 0.0,
                offsetY: 0,
                offsetX: 48,
                cursorStyle: 'pointer',
                mouseUpHandler: this.deleteLogoObject.bind(this),
                render: this.renderDeleteIcon.bind(this),
                cornerSize: 72,
            });

            // Add custom clone control
            img.controls.cloneControl = new fabric.Control({
                x: -0.5,
                y: 0.0,
                offsetY: 0,
                offsetX: -48,
                cursorStyle: 'pointer',
                mouseUpHandler: this.cloneLogoObject.bind(this),
                render: this.renderCloneIcon.bind(this),
                cornerSize: 72,
            });

            debugLog(`📏 Logo restored at (${logoConfig.left.toFixed(0)}, ${logoConfig.top.toFixed(0)}) with scale ${logoConfig.scaleX.toFixed(2)}x and rotation ${logoConfig.angle}° on ${partName} canvas`);

            // Add logo to canvas
            fabricCanvas.add(img);

            fabricCanvas.renderAll();

            // Update the 3D texture for this part
            this.updateTexture(partName);

            const totalTime = performance.now() - startTime;
            debugLog(`⚡ Logo restored to ${partName} in ${totalTime.toFixed(0)}ms`);
        }, { crossOrigin: 'anonymous' });
    }

    // Delete logo object handler
    deleteLogoObject(eventData, transform) {
        const target = transform.target;
        const canvas = target.canvas;
        canvas.remove(target);
        canvas.requestRenderAll();

        // Update 3D texture after deletion
        const partName = this.currentPart;
        this.updateTexture(partName);

        debugLog(`🗑️ Logo deleted from "${partName}"`);
        return true;
    }

    // Clone logo object handler
    cloneLogoObject(eventData, transform) {
        const target = transform.target;
        const canvas = target.canvas;

        target.clone((cloned) => {
            cloned.set({
                left: cloned.left + 40,
                top: cloned.top + 40
            });

            // Set name property directly (not through set() to avoid issues)
            cloned.name = 'logoLayer';

            // Copy custom controls to cloned object
            cloned.controls.deleteControl = target.controls.deleteControl;
            cloned.controls.cloneControl = target.controls.cloneControl;

            // Copy baseScale property for slider functionality
            if (target.baseScale) {
                cloned.baseScale = target.baseScale;
            } else {
                // If original doesn't have baseScale, use its current scale
                cloned.baseScale = target.scaleX;
            }

            canvas.add(cloned);
            canvas.setActiveObject(cloned);
            canvas.requestRenderAll();

            // Update 3D texture after cloning
            const partName = this.currentPart;
            this.updateTexture(partName);

            debugLog(`📋 Logo cloned on "${partName}" with name: "${cloned.name}", baseScale: ${cloned.baseScale}`);
        });

        return true;
    }

    // Render delete icon (red circle with white X)
    renderDeleteIcon(ctx, left, top, styleOverride, fabricObject) {
        const size = 72;

        ctx.save();
        ctx.translate(left, top);

        // Draw the delete icon image if loaded
        if (this.deleteIcon && this.deleteIcon.complete) {
            ctx.drawImage(this.deleteIcon, -size / 2, -size / 2, size, size);
        } else {
            // Fallback: Draw red circle with white X if image not loaded
            ctx.beginPath();
            ctx.arc(0, 0, size / 2, 0, 2 * Math.PI);
            ctx.fillStyle = '#ff4444';
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            const offset = size / 4;
            ctx.beginPath();
            ctx.moveTo(-offset, -offset);
            ctx.lineTo(offset, offset);
            ctx.moveTo(offset, -offset);
            ctx.lineTo(-offset, offset);
            ctx.stroke();
        }

        ctx.restore();
    }

    // Render clone icon (using copy.svg)
    renderCloneIcon(ctx, left, top, styleOverride, fabricObject) {
        const size = 72;

        ctx.save();
        ctx.translate(left, top);

        // Draw the copy icon image if loaded
        if (this.copyIcon && this.copyIcon.complete) {
            ctx.drawImage(this.copyIcon, -size / 2, -size / 2, size, size);
        } else {
            // Fallback: Draw green circle with white + if image not loaded
            ctx.beginPath();
            ctx.arc(0, 0, size / 2, 0, 2 * Math.PI);
            ctx.fillStyle = '#44cc44';
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            const offset = size / 4;
            ctx.beginPath();
            ctx.moveTo(-offset, 0);
            ctx.lineTo(offset, 0);
            ctx.moveTo(0, -offset);
            ctx.lineTo(0, offset);
            ctx.stroke();
        }

        ctx.restore();
    }

    // Setup UI controls for logo scale and rotation
    setupLogoControls() {
        const scaleSlider = document.getElementById('logo-scale');
        const rotateSlider = document.getElementById('logo-rotate');

        if (!scaleSlider || !rotateSlider) {
            console.warn('Logo controls not found');
            return;
        }

        // Remove existing event listeners to avoid duplicates
        const newScaleSlider = scaleSlider.cloneNode(true);
        const newRotateSlider = rotateSlider.cloneNode(true);
        scaleSlider.parentNode.replaceChild(newScaleSlider, scaleSlider);
        rotateSlider.parentNode.replaceChild(newRotateSlider, rotateSlider);

        // Scale control - works with active object
        newScaleSlider.addEventListener('input', (e) => {
            // Find the canvas with an active object
            let activeObject = null;
            let activeCanvas = null;

            for (const [partName, fabricCanvas] of Object.entries(this.partCanvases)) {
                const obj = fabricCanvas.getActiveObject();

                // Check if it's a logo - either has correct name OR is a selectable image with custom controls
                if (obj && obj.type === 'image') {
                    const hasLogoName = obj.name === 'logoLayer';
                    const hasCustomControls = obj.controls && (obj.controls.deleteControl || obj.controls.cloneControl);

                    if (hasLogoName || hasCustomControls) {
                        activeObject = obj;
                        activeCanvas = fabricCanvas;
                        break;
                    }
                }
            }

            if (!activeObject || !activeCanvas) {
                debugLog('No logo selected - scale slider has no effect');
                return;
            }

            const scaleMultiplier = parseFloat(e.target.value);

            // Calculate base scale from current object if not stored
            if (!activeObject.baseScale) {
                activeObject.baseScale = activeObject.scaleX;
            }

            const newScale = activeObject.baseScale * scaleMultiplier;

            activeObject.set({
                scaleX: newScale,
                scaleY: newScale
            });

            activeCanvas.renderAll();

            // Update texture for the part where the logo is
            const partName = Object.keys(this.partCanvases).find(
                key => this.partCanvases[key] === activeCanvas
            );
            if (partName) {
                this.updateTexture(partName);
            }
        });

        // Rotation control - works with active object
        newRotateSlider.addEventListener('input', (e) => {
            // Find the canvas with an active object
            let activeObject = null;
            let activeCanvas = null;

            debugLog('🔍 Searching for active logo across all canvases...');
            for (const [partName, fabricCanvas] of Object.entries(this.partCanvases)) {
                const obj = fabricCanvas.getActiveObject();
                debugLog(`  Checking ${partName}: activeObject =`, obj ? `type=${obj.type}, name=${obj.name}` : 'null');

                // Check if it's a logo - either has correct name OR is a selectable image with custom controls
                if (obj && obj.type === 'image') {
                    const hasLogoName = obj.name === 'logoLayer';
                    const hasCustomControls = obj.controls && (obj.controls.deleteControl || obj.controls.cloneControl);

                    if (hasLogoName || hasCustomControls) {
                        activeObject = obj;
                        activeCanvas = fabricCanvas;
                        debugLog(`  ✅ Found active logo on ${partName}`);
                        break;
                    }
                }
            }

            if (!activeObject || !activeCanvas) {
                debugLog('No logo selected - rotation slider has no effect');
                return;
            }

            const angle = parseFloat(e.target.value);
            activeObject.set({ angle: angle });

            activeCanvas.renderAll();

            // Update texture for the part where the logo is
            const partName = Object.keys(this.partCanvases).find(
                key => this.partCanvases[key] === activeCanvas
            );
            if (partName) {
                this.updateTexture(partName);
            }
        });

        debugLog(`✅ Logo controls connected to UI sliders (works with active object)`);
    }

    // Update logo sliders when a logo is selected
    updateLogoSliders(selectedObject) {
        if (!selectedObject || selectedObject.type !== 'image' || selectedObject.name !== 'logoLayer') {
            return;
        }

        const scaleSlider = document.getElementById('logo-scale');
        const rotateSlider = document.getElementById('logo-rotate');

        if (scaleSlider && rotateSlider) {
            // Store base scale if not already stored
            if (!selectedObject.baseScale) {
                selectedObject.baseScale = selectedObject.scaleX;
            }

            // Calculate current scale multiplier
            const scaleMultiplier = selectedObject.scaleX / selectedObject.baseScale;
            scaleSlider.value = scaleMultiplier;

            // Update rotation slider
            rotateSlider.value = selectedObject.angle || 0;

            debugLog(`📊 Updated sliders for selected logo: scale=${scaleMultiplier.toFixed(2)}, rotation=${selectedObject.angle}°`);
        }
    }

    // Reset logo sliders when no logo is selected
    resetLogoSliders() {
        const scaleSlider = document.getElementById('logo-scale');
        const rotateSlider = document.getElementById('logo-rotate');

        if (scaleSlider && rotateSlider) {
            scaleSlider.value = 1;
            rotateSlider.value = 0;
            debugLog('📊 Reset sliders (no logo selected)');
        }
    }

    // Load initial configuration from saved data
    loadInitialConfig(config) {
        if (!config) {
            debugLog('No configuration to load, using defaults');
            return;
        }

        debugLog('Loading initial configuration:', config);

        if (config.activeTab === 'designs' && config.design) {
            // Load design mode configuration
            if (config.design.svgPath) {
                debugLog(`Loading SVG design: ${config.design.svgPath}`);
                this.loadSVGDesign(config.design.svgPath);
            }

            // Apply design colors (color pickers are already set by script.js)
            // The SVG design will use these colors if it supports color replacement
        } else if (config.activeTab === 'colors') {
            // Load colors & stripes mode configuration
            if (config.parts) {
                // Apply part colors to the 3D model
                Object.entries(config.parts).forEach(([partName, partConfig]) => {
                    if (partConfig.color) {
                        debugLog(`Applying color ${partConfig.color} to part: ${partName}`);
                        // Apply color to the Fabric canvas for this part
                        const fabricCanvas = this.partCanvases[partName];
                        if (fabricCanvas) {
                            fabricCanvas.backgroundColor = partConfig.color;
                            fabricCanvas.renderAll();
                            this.updateTexture(partName);
                        }
                    }
                });
            }

            // Stripe configurations will be handled by the UI
            // The 3D model will reflect changes as the user interacts with controls
        }

        // Load logos if present
        if (config.logos) {
            Object.entries(config.logos).forEach(([partName, logos]) => {
                if (logos && logos.length > 0) {
                    logos.forEach(logoConfig => {
                        if (logoConfig.url) {
                            debugLog(`Loading logo for ${partName}:`, logoConfig);

                            // Load logo with saved configuration (position, scale, rotation)
                            this.readLogoWithConfig(logoConfig.url, logoConfig, partName);
                        }
                    });
                }
            }); // Close forEach
        } // Close if (config.logos)

        debugLog('✅ Initial configuration loaded');
    } // Close loadInitialConfig method

    // Get all logos configuration from all parts
    getLogosConfiguration() {
        const logosConfig = {
            front: [],
            back: [],
            'right-sleeve': [],
            'left-sleeve': []
        };

        // Iterate through all part canvases
        Object.keys(this.partCanvases).forEach(partName => {
            const fabricCanvas = this.partCanvases[partName];
            if (!fabricCanvas) return;

            // Get all objects from the canvas
            const objects = fabricCanvas.getObjects();

            // Filter for logo objects (images that are selectable and have controls)
            // This catches logos regardless of their name property
            const logos = objects.filter(obj => {
                // Check if it's an image with logo-like properties
                const isImage = obj.type === 'image';
                const hasLogoName = obj.name === 'logoLayer';
                const isSelectable = obj.selectable === true;
                const hasCustomControls = obj.controls && (obj.controls.deleteControl || obj.controls.cloneControl);

                // Exclude design images (they're centered at canvas center with scale 1)
                const isCentered = obj.left === 1024 && obj.top === 1024 && obj.scaleX === 1 && obj.scaleY === 1;

                // Accept if it has the correct name OR if it's BOTH selectable AND has custom controls
                // (SVG designs are not selectable, so this excludes them)
                // Also exclude centered images (design backgrounds)
                return isImage && !isCentered && (hasLogoName || (isSelectable && hasCustomControls));
            });

            debugLog(`💾 Saving ${logos.length} logo(s) from ${partName}`);

            // Store logo data for this part
            logosConfig[partName] = logos.map(logo => ({
                url: logo.getSrc(), // Get the image source URL
                left: logo.left,
                top: logo.top,
                scaleX: logo.scaleX,
                scaleY: logo.scaleY,
                angle: logo.angle || 0,
                originX: logo.originX,
                originY: logo.originY
            }));
        });

        return logosConfig;
    }


    loadModel(modelPath) {
        // Remove existing model if any
        if (this.current3DObject) {
            this.scene.remove(this.current3DObject);
            this.current3DObject = null;
        }

        // Load GLB model
        this.gltfLoader.load(
            modelPath,
            (gltf) => {
                this.current3DObject = gltf.scene;

                let meshCount = 0;
                let texturedMeshCount = 0;

                // First pass: Log all materials found in the model
                debugLog('🔍 === MATERIAL DISCOVERY ===');
                const foundMaterials = new Set();
                this.current3DObject.traverse((child) => {
                    if (child.isMesh && child.material) {
                        const matName = child.material.name || 'unnamed';
                        foundMaterials.add(matName);
                    }
                });
                debugLog('📋 All materials in model:', Array.from(foundMaterials));
                debugLog('🗺️ Current material mapping:', this.materialToPartMap);
                debugLog('🔍 === END MATERIAL DISCOVERY ===\n');

                // Apply texture to all meshes in the model while preserving AO and normal maps
                this.current3DObject.traverse((child) => {
                    if (child.isMesh) {
                        meshCount++;

                        // Skip stitch materials - they should keep their original appearance
                        if (this.shouldExcludeMaterial(child.material)) {
                            debugLog(`⏭️ Skipping material: "${child.material.name}" (stitch material)`);
                            return; // Skip this mesh
                        }

                        // Get the material name and find corresponding part
                        const materialName = child.material?.name || '';
                        const partName = this.materialToPartMap[materialName];

                        if (!partName) {
                            console.warn(`⚠️ No part mapping for material: "${materialName}" - This material will not receive textures!`);
                            return;
                        }

                        // Get the texture for this part
                        const partTexture = this.partTextures[partName];
                        if (!partTexture) {
                            console.warn(`⚠️ No texture found for part: "${partName}"`);
                            return;
                        }

                        // Log UV coordinates for debugging
                        if (child.geometry.attributes.uv) {
                            const uvs = child.geometry.attributes.uv;
                            debugLog(`🔍 Mesh "${child.name}" (${materialName}) UV range:`, {
                                count: uvs.count,
                                itemSize: uvs.itemSize
                            });
                        } else {
                            console.warn(`⚠️ Mesh "${child.name}" has NO UV mapping!`);
                        }

                        // Preserve the original material properties (AO, normal maps, etc.)
                        const originalMaterial = child.material;

                        // Clone the material to avoid modifying the original
                        if (originalMaterial.isMeshStandardMaterial || originalMaterial.isMeshPhysicalMaterial) {
                            child.material = originalMaterial.clone();

                            // Apply the part-specific texture while preserving other maps
                            child.material.map = partTexture;

                            // Log what maps are present
                            debugLog(`📦 Mesh "${child.name}" (${materialName} → ${partName}) maps:`, {
                                hasAO: !!child.material.aoMap,
                                hasNormal: !!child.material.normalMap,
                                hasRoughness: !!child.material.roughnessMap,
                                hasMetalness: !!child.material.metalnessMap
                            });
                        } else {
                            // Fallback: create new material if original is not PBR
                            child.material = new THREE.MeshStandardMaterial({
                                map: this.texture,
                                roughness: 0.5,
                                metalness: 0.1,
                                side: THREE.DoubleSide
                            });
                        }

                        // Apply texture filtering and wrapping for crisp rendering
                        if (child.material.map) {
                            child.material.map.magFilter = THREE.LinearFilter;
                            child.material.map.minFilter = THREE.LinearMipmapLinearFilter;

                            // Enable texture wrapping (important for UV mapping)
                            child.material.map.wrapS = THREE.RepeatWrapping;
                            child.material.map.wrapT = THREE.RepeatWrapping;

                            // Force texture update
                            child.material.map.needsUpdate = true;
                            child.material.needsUpdate = true;

                            texturedMeshCount++;
                        }

                        // Ensure material updates
                        child.material.needsUpdate = true;
                    }
                });

                debugLog(`✅ Model loaded: ${meshCount} meshes found, ${texturedMeshCount} textured`);

                // Scale and position the model appropriately
                const box = new THREE.Box3().setFromObject(this.current3DObject);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());

                // Scale to fit in view (target size of 4 units)
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = 2 / maxDim;
                this.current3DObject.scale.setScalar(scale);

                // Center the model
                this.current3DObject.position.sub(center.multiplyScalar(scale));

                this.scene.add(this.current3DObject);
                debugLog('📦 Model positioned and added to scene');
            },
            (progress) => {
                debugLog('Loading progress:', (progress.loaded / progress.total * 100) + '%');
            },
            (error) => {
                console.error('Error loading model:', error);
            }
        );
    }

    setupCameraReset() {
        // Add double-click event listener to reset camera
        this.renderer.domElement.addEventListener('dblclick', () => {
            this.resetCamera();
        });
    }

    resetCamera() {
        if (this.isAnimatingCamera) return; // Prevent multiple animations

        debugLog(`🎥 Resetting camera to initial position (duration: ${this.cameraResetDuration}ms)`);

        // Store current positions
        this.cameraStartPosition = this.camera.position.clone();
        this.controlsStartTarget = this.controls.target.clone();

        // Start animation with timestamp
        this.isAnimatingCamera = true;
        this.cameraAnimationStartTime = performance.now();
    }

    updateCameraAnimation() {
        if (!this.isAnimatingCamera) return;

        // Calculate elapsed time and progress
        const currentTime = performance.now();
        const elapsedTime = currentTime - this.cameraAnimationStartTime;
        const progress = Math.min(elapsedTime / this.cameraResetDuration, 1);

        if (progress >= 1) {
            // Animation complete
            if (this.isAnimatingToPart && this.targetCameraPosition) {
                // Animating to part position
                this.camera.position.copy(this.targetCameraPosition);
                this.controls.target.copy(this.targetControlsTarget);
                this.isAnimatingToPart = false;
            } else {
                // Animating to initial/reset position
                this.camera.position.copy(this.initialCameraPosition);
                this.controls.target.copy(this.initialControlsTarget);
            }
            this.isAnimatingCamera = false;
        } else {
            // Ease-out cubic easing for smooth animation
            const easeProgress = 1 - Math.pow(1 - progress, 3);

            // Determine target based on animation type
            const targetPos = this.isAnimatingToPart && this.targetCameraPosition
                ? this.targetCameraPosition
                : this.initialCameraPosition;
            const targetCtrl = this.isAnimatingToPart && this.targetControlsTarget
                ? this.targetControlsTarget
                : this.initialControlsTarget;

            // Use spherical interpolation for orbital movement (for all animations)
            const center = new THREE.Vector3(0, 0, 0); // Jersey center

            // Get start spherical coordinates
            const startSpherical = new THREE.Spherical();
            startSpherical.setFromVector3(this.cameraStartPosition.clone().sub(center));

            // Get target spherical coordinates
            const targetSpherical = new THREE.Spherical();
            targetSpherical.setFromVector3(targetPos.clone().sub(center));

            // Interpolate spherical coordinates
            const currentSpherical = new THREE.Spherical(
                THREE.MathUtils.lerp(startSpherical.radius, targetSpherical.radius, easeProgress),
                THREE.MathUtils.lerp(startSpherical.phi, targetSpherical.phi, easeProgress),
                THREE.MathUtils.lerp(startSpherical.theta, targetSpherical.theta, easeProgress)
            );

            // Convert back to Cartesian coordinates
            this.camera.position.setFromSpherical(currentSpherical).add(center);

            // Interpolate controls target (always linear)
            this.controls.target.lerpVectors(
                this.controlsStartTarget,
                targetCtrl,
                easeProgress
            );
        }

        this.controls.update();
    }

    // Animate camera to a specific part's position
    animateCameraToPart(partName) {
        // Check if we have a predefined position for this part
        const targetPosition = CAMERA_POSITION_FOR_PART[partName];

        if (!targetPosition) {
            console.warn(`No camera position defined for part: ${partName}`);
            return;
        }

        debugLog(`🎥 Animating camera to "${partName}" position:`, targetPosition);

        // Store current camera position and target as start points
        this.cameraStartPosition = this.camera.position.clone();
        this.controlsStartTarget = this.controls.target.clone();

        // Set target position (convert to THREE.Vector3)
        this.targetCameraPosition = new THREE.Vector3(
            targetPosition.x,
            targetPosition.y,
            targetPosition.z
        );

        // Keep controls target at origin (looking at the jersey center)
        this.targetControlsTarget = new THREE.Vector3(0, 0, 0);

        // Start animation with timestamp
        this.isAnimatingCamera = true;
        this.cameraAnimationStartTime = performance.now();
        this.isAnimatingToPart = true; // Flag to differentiate from reset animation
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());

        // Update camera animation if active
        this.updateCameraAnimation();

        // Update camera position in debug panel (if debug mode is enabled)
        if (DEBUG_MODE && this.updateCameraPositionDebug) {
            this.updateCameraPositionDebug();
        }

        // Update controls
        this.controls.update();

        // Render scene
        this.renderer.render(this.scene, this.camera);
    }

    handleResize() {
        window.addEventListener('resize', () => {
            if (!this.container) return;

            const width = this.container.clientWidth;
            const height = this.container.clientHeight;

            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();

            this.renderer.setSize(width, height);
        });
    }

    // Method to update jersey color
    updateColor(part, color) {
        if (!this.jerseyMesh) return;

        // This will be expanded to handle different parts
        debugLog(`Updating ${part} to color ${color}`);
    }

    // Cleanup method
    dispose() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.renderer) {
            this.renderer.dispose();
        }
        if (this.controls) {
            this.controls.dispose();
        }
    }
}

// Initialize the viewer - will be called from script.js
let jerseyViewer;

// Initialize function - called from script.js after DOM is ready
function initViewer() {
    jerseyViewer = new JerseyViewer('#viewer-container');

    // Expose on window for use in script.js
    window.jerseyViewer = jerseyViewer;

    // Initialize debug canvas to show current part if in debug mode
    if (DEBUG_MODE) {
        jerseyViewer.switchDebugCanvas(jerseyViewer.currentPart);
    }
}

// Export for use in other scripts
export { jerseyViewer, JerseyViewer, initViewer };
