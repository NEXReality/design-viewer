// Design Viewer Script
// Handles folder selection, file parsing, and button interactions

let designName = null;
let fileMap = {}; // Maps "collar_shoulder" to File object
let currentObjectURLs = []; // Track object URLs for cleanup

// Wait for DOM and 3D script to be ready
document.addEventListener('DOMContentLoaded', () => {
    // Import and initialize the 3D viewer
    import('./threeD-script.js').then(module => {
        // Initialize the 3D viewer
        if (module.initViewer) {
            module.initViewer();
        }

        // Setup folder selection
        setupFolderSelection();
        
        // Setup button handlers
        setupButtonHandlers();
    }).catch(error => {
        console.error('Error loading 3D script:', error);
    });
});

function setupFolderSelection() {
    const dropZone = document.getElementById('drop-zone');
    const folderInput = document.getElementById('folder-input');
    const folderInfo = document.getElementById('folder-info');
    const buttonsSection = document.getElementById('buttons-section');

    // Click to select folder
    dropZone.addEventListener('click', () => {
        folderInput.click();
    });

    // Drag and drop handlers
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        
        const items = e.dataTransfer.items;
        if (items.length > 0 && items[0].webkitGetAsEntry) {
            const entry = items[0].webkitGetAsEntry();
            if (entry.isDirectory) {
                processDirectory(entry);
            }
        }
    });

    // File input change handler
    folderInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            // Get folder name from first file's path
            const firstFile = files[0];
            if (firstFile.webkitRelativePath) {
                const pathParts = firstFile.webkitRelativePath.split('/');
                if (pathParts.length > 1) {
                    designName = pathParts[0];
                    console.log('=== Folder selected via file input ===');
                    console.log('Folder name:', designName);
                    console.log('Total files in folder:', files.length);
                    processFiles(files);
                } else {
                    console.log('No folder path found, processing files directly');
                    processFiles(files);
                }
            } else {
                console.log('No webkitRelativePath, processing files directly');
                processFiles(files);
            }
        }
    });
}

async function processDirectory(directoryEntry) {
    const files = [];
    
    async function readDirectory(entry) {
        return new Promise((resolve) => {
            const reader = entry.createReader();
            const allEntries = [];
            
            function readBatch() {
                reader.readEntries((results) => {
                    if (results.length === 0) {
                        resolve(allEntries);
                    } else {
                        allEntries.push(...results);
                        readBatch();
                    }
                });
            }
            
            readBatch();
        });
    }
    
    async function collectFiles(entry) {
        if (entry.isFile) {
            const file = await new Promise((resolve) => {
                entry.file(resolve);
            });
            files.push(file);
            console.log('Collected file:', file.name);
        } else if (entry.isDirectory) {
            const entries = await readDirectory(entry);
            console.log(`Reading directory: ${entry.name}, found ${entries.length} entries`);
            for (const subEntry of entries) {
                await collectFiles(subEntry);
            }
        }
    }
    
    designName = directoryEntry.name;
    console.log('Processing directory:', designName);
    await collectFiles(directoryEntry);
    console.log('Total files collected:', files.length);
    processFiles(files);
}

function processFiles(files) {
    // Clear previous file map
    fileMap = {};
    
    console.log('=== Processing files ===');
    console.log('Total files:', files.length);
    console.log('Design name:', designName);
    
    // Filter only SVG files and ignore .ai files
    const svgFiles = files.filter(file => {
        const name = file.name.toLowerCase();
        return name.endsWith('.svg');
    });

    console.log('SVG files found:', svgFiles.length);
    svgFiles.forEach(f => console.log('  -', f.name));

    // Extract design name from folder name or first file if not set
    if (!designName && svgFiles.length > 0) {
        const firstFile = svgFiles[0];
        const filename = firstFile.name.toLowerCase().replace('.svg', '');
        const parts = filename.split('_');
        if (parts.length >= 3) {
            designName = parts.slice(2).join('_');
            console.log('Extracted design name from first file:', designName);
        }
    }

    // Parse each SVG file - accept ALL files that match the pattern collar_shoulder_designName
    // Important: shoulder can be "set_in" (contains underscore) or "reglan"
    svgFiles.forEach(file => {
        const filename = file.name.toLowerCase().replace('.svg', '');
        
        let collar, shoulder, designPart, key;
        
        // Handle special case: v_neck_crossed (contains underscores)
        if (filename.startsWith('v_neck_crossed_')) {
            // Format: v_neck_crossed_shoulder_designName
            const rest = filename.replace('v_neck_crossed_', '');
            collar = 'v_neck_crossed';
            
            // Check if shoulder is "set_in" (contains underscore) or "reglan"
            if (rest.startsWith('set_in_')) {
                shoulder = 'set_in';
                designPart = rest.replace('set_in_', '');
                key = 'v_neck_crossed_set_in';
            } else if (rest.startsWith('reglan_')) {
                shoulder = 'reglan';
                designPart = rest.replace('reglan_', '');
                key = 'v_neck_crossed_reglan';
            }
        } else if (filename.startsWith('v_neck_')) {
            // Format: v_neck_shoulder_designName (not crossed)
            const rest = filename.replace('v_neck_', '');
            collar = 'v_neck';
            
            // Check if shoulder is "set_in" (contains underscore) or "reglan"
            if (rest.startsWith('set_in_')) {
                shoulder = 'set_in';
                designPart = rest.replace('set_in_', '');
                key = 'v_neck_set_in';
            } else if (rest.startsWith('reglan_')) {
                shoulder = 'reglan';
                designPart = rest.replace('reglan_', '');
                key = 'v_neck_reglan';
            }
        } else {
            // Format: collar_shoulder_designName (insert, round)
            // Check for set_in first (contains underscore), then reglan
            if (filename.includes('_set_in_')) {
                const parts = filename.split('_set_in_');
                if (parts.length === 2) {
                    collar = parts[0]; // insert or round
                    shoulder = 'set_in';
                    designPart = parts[1];
                    key = `${collar}_set_in`;
                }
            } else if (filename.includes('_reglan_')) {
                const parts = filename.split('_reglan_');
                if (parts.length === 2) {
                    collar = parts[0]; // insert or round
                    shoulder = 'reglan';
                    designPart = parts[1];
                    key = `${collar}_reglan`;
                }
            }
        }
        
        // Validate and add to map
        if (key && collar && shoulder) {
            const validCollars = ['insert', 'round', 'v_neck', 'v_neck_crossed'];
            const validShoulders = ['set_in', 'reglan'];
            
            if (validCollars.includes(collar) && validShoulders.includes(shoulder)) {
                // Only add if we don't already have a file for this key
                if (!fileMap[key]) {
                    fileMap[key] = file;
                    console.log(`✓ Mapped: ${file.name} -> ${key} (collar: "${collar}", shoulder: "${shoulder}", design: "${designPart}")`);
                } else {
                    console.log(`✗ Duplicate key ${key}, keeping: ${fileMap[key].name}, skipping: ${file.name}`);
                }
            } else {
                console.log(`✗ Invalid collar/shoulder: ${file.name} (collar: "${collar}", shoulder: "${shoulder}")`);
            }
        } else {
            console.log(`✗ Could not parse filename: ${file.name} (key: ${key}, collar: ${collar}, shoulder: ${shoulder})`);
        }
    });

    console.log('=== File mapping results ===');
    console.log('File map keys:', Object.keys(fileMap));
    console.log('Total mapped files:', Object.keys(fileMap).length);
    Object.keys(fileMap).forEach(key => {
        console.log(`  ${key}: ${fileMap[key].name}`);
    });

    // Update UI first
    updateUI();
    
    // Validate files (async, won't block UI) - pass fileMap to check design name consistency
    validateFiles(svgFiles, fileMap);
}

function updateUI() {
    const designInfo = document.getElementById('design-info');
    const designNameSpan = document.getElementById('design-name');
    const filesCountSpan = document.getElementById('files-count');
    const buttonsSection = document.getElementById('buttons-section');
    const dropZone = document.getElementById('drop-zone');

    const mappedCount = Object.keys(fileMap).length;
    
    console.log('=== Updating UI ===');
    console.log('Design name:', designName);
    console.log('Mapped files count:', mappedCount);
    
    if (mappedCount > 0) {
        // Show design info
        designInfo.style.display = 'block';
        if (designName) {
            designNameSpan.textContent = designName;
        } else {
            designNameSpan.textContent = 'Unknown';
        }
        filesCountSpan.textContent = mappedCount;

        // Show buttons section
        buttonsSection.style.display = 'block';

        // Update button states
        updateButtonStates();

        // Show success state on drop zone
        dropZone.classList.add('has-files');
    } else {
        designInfo.style.display = 'none';
        buttonsSection.style.display = 'none';
        dropZone.classList.remove('has-files');
    }
}

function updateButtonStates() {
    const buttons = document.querySelectorAll('.design-button');
    
    console.log('=== Updating button states ===');
    console.log('File map keys:', Object.keys(fileMap));
    console.log('Total buttons:', buttons.length);
    
    let enabledCount = 0;
    
    buttons.forEach(button => {
        const collar = button.dataset.collar;
        const shoulder = button.dataset.shoulder;
        // Create key matching the format used in processFiles
        const key = `${collar}_${shoulder}`;
        
        const hasFile = !!fileMap[key];
        console.log(`Button: "${button.textContent.trim()}", collar: "${collar}", shoulder: "${shoulder}", key: "${key}", has file: ${hasFile}`);
        
        if (hasFile) {
            button.disabled = false;
            button.classList.remove('disabled');
            enabledCount++;
        } else {
            button.disabled = true;
            button.classList.add('disabled');
        }
    });
    
    console.log(`Enabled buttons: ${enabledCount} out of ${buttons.length}`);
    console.log('=== End button state update ===');
}

function setupButtonHandlers() {
    const buttons = document.querySelectorAll('.design-button');
    
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            if (button.disabled) return;
            
            const collar = button.dataset.collar;
            const shoulder = button.dataset.shoulder;
            const key = `${collar}_${shoulder}`;
            
            const file = fileMap[key];
            if (!file) {
                console.error(`File not found for ${key}`);
                return;
            }

            loadDesign(collar, shoulder, file);
        });
    });
}

function loadDesign(collar, shoulder, file) {
    if (!window.jerseyViewer) {
        console.error('Jersey viewer not initialized');
        return;
    }

    // Show loading overlay
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    // Clean up previous object URLs
    currentObjectURLs.forEach(url => URL.revokeObjectURL(url));
    currentObjectURLs = [];

    // Create object URL for the SVG file
    const svgURL = URL.createObjectURL(file);
    currentObjectURLs.push(svgURL);

    // Get model path
    const modelPath = getModelPath(collar, shoulder);
    
    // Update variation label
    const variationLabel = document.getElementById('variation-label');
    const variationName = `${collar}_${shoulder}`;
    variationLabel.textContent = variationName;
    variationLabel.style.display = 'block';
    
    console.log(`Loading design: ${collar}_${shoulder}_${designName}`);
    console.log(`Model: ${modelPath}`);
    console.log(`SVG: ${file.name}`);

    // Load the 3D model first
    window.jerseyViewer.loadModel(modelPath);
    
    // Wait a bit for model to start loading, then apply texture
    // The model loading is async, so we'll apply texture after a short delay
    setTimeout(() => {
        window.jerseyViewer.loadSVGDesign(svgURL);
        
        // Hide loading overlay after texture is applied
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
        }, 1000);
    }, 500);
}

// Validation function
async function validateFiles(svgFiles, fileMap) {
    const errors = [];
    const designNamesMap = new Map(); // Track design name for each file
    
    console.log('=== Validating files ===');
    
    // First pass: collect all design names from all files
    for (const file of svgFiles) {
        const filename = file.name.toLowerCase();
        if (!filename.endsWith('.svg')) continue;
        
        const nameWithoutExt = filename.replace('.svg', '');
        let designPart = null;
        
        // Extract design name using same logic as file processing
        if (nameWithoutExt.startsWith('v_neck_crossed_')) {
            const rest = nameWithoutExt.replace('v_neck_crossed_', '');
            if (rest.startsWith('set_in_')) {
                designPart = rest.replace('set_in_', '');
            } else if (rest.startsWith('reglan_')) {
                designPart = rest.replace('reglan_', '');
            }
        } else if (nameWithoutExt.startsWith('v_neck_')) {
            const rest = nameWithoutExt.replace('v_neck_', '');
            if (rest.startsWith('set_in_')) {
                designPart = rest.replace('set_in_', '');
            } else if (rest.startsWith('reglan_')) {
                designPart = rest.replace('reglan_', '');
            }
        } else if (nameWithoutExt.includes('_set_in_')) {
            const parts = nameWithoutExt.split('_set_in_');
            if (parts.length === 2) {
                designPart = parts[1];
            }
        } else if (nameWithoutExt.includes('_reglan_')) {
            const parts = nameWithoutExt.split('_reglan_');
            if (parts.length === 2) {
                designPart = parts[1];
            }
        }
        
        if (designPart) {
            designNamesMap.set(file.name, designPart);
        }
    }
    
    // Check for design name consistency - use most common design name as expected
    // Count occurrences of each design name
    const designNameCounts = new Map();
    designNamesMap.forEach(designName => {
        designNameCounts.set(designName, (designNameCounts.get(designName) || 0) + 1);
    });
    
    const uniqueDesignNames = Array.from(designNameCounts.keys());
    const hasInconsistentDesignNames = uniqueDesignNames.length > 1;
    
    // Find the most common design name
    let expectedDesignName = null;
    let maxCount = 0;
    designNameCounts.forEach((count, name) => {
        if (count > maxCount) {
            maxCount = count;
            expectedDesignName = name;
        }
    });
    
    if (hasInconsistentDesignNames) {
        console.warn('⚠️ Design name inconsistency detected:', uniqueDesignNames);
        console.warn(`Expected design name: "${expectedDesignName}" (appears in ${maxCount} files)`);
    }
    
    for (const file of svgFiles) {
        const fileErrors = [];
        const filename = file.name;
        const filenameLower = filename.toLowerCase();
        
        // Check file extension
        if (!filenameLower.endsWith('.svg')) {
            fileErrors.push('File must have .svg extension');
            continue; // Skip further validation for non-SVG files
        }
        
        // Check for spaces
        if (filename.includes(' ')) {
            fileErrors.push('Filename contains spaces (not allowed)');
        }
        
        // Check for capital letters
        if (filename !== filenameLower) {
            fileErrors.push('Filename contains capital letters (use lowercase only)');
        }
        
        // Check for invalid symbols (only allow letters, numbers, underscores, and dots)
        // Note: We allow dots for the extension, but check that there's only one dot (for extension)
        const nameWithoutExt = filenameLower.replace('.svg', '');
        const invalidSymbols = /[^a-z0-9_]/g;
        if (invalidSymbols.test(nameWithoutExt)) {
            fileErrors.push('Filename contains invalid symbols (only lowercase letters, numbers, and underscores allowed)');
        }
        
        // Check for multiple dots (should only have one for extension)
        const dotCount = (filename.match(/\./g) || []).length;
        if (dotCount > 1) {
            fileErrors.push('Filename contains multiple dots (only one dot allowed for file extension)');
        }
        
        // Check naming convention: collar_shoulder_designName.svg
        const nameWithoutExtForValidation = filenameLower.replace('.svg', '');
        
        // Check if it follows the pattern
        let hasNamingError = false;
        
        // Try to parse the filename
        let collar, shoulder, designPart;
        
        if (nameWithoutExtForValidation.startsWith('v_neck_crossed_')) {
            const rest = nameWithoutExtForValidation.replace('v_neck_crossed_', '');
            if (rest.startsWith('set_in_')) {
                collar = 'v_neck_crossed';
                shoulder = 'set_in';
                designPart = rest.replace('set_in_', '');
            } else if (rest.startsWith('reglan_')) {
                collar = 'v_neck_crossed';
                shoulder = 'reglan';
                designPart = rest.replace('reglan_', '');
            } else {
                hasNamingError = true;
            }
        } else if (nameWithoutExtForValidation.startsWith('v_neck_')) {
            const rest = nameWithoutExtForValidation.replace('v_neck_', '');
            if (rest.startsWith('set_in_')) {
                collar = 'v_neck';
                shoulder = 'set_in';
                designPart = rest.replace('set_in_', '');
            } else if (rest.startsWith('reglan_')) {
                collar = 'v_neck';
                shoulder = 'reglan';
                designPart = rest.replace('reglan_', '');
            } else {
                hasNamingError = true;
            }
        } else if (nameWithoutExtForValidation.includes('_set_in_')) {
            const parts = nameWithoutExtForValidation.split('_set_in_');
            if (parts.length === 2) {
                collar = parts[0];
                shoulder = 'set_in';
                designPart = parts[1];
            } else {
                hasNamingError = true;
            }
        } else if (nameWithoutExtForValidation.includes('_reglan_')) {
            const parts = nameWithoutExtForValidation.split('_reglan_');
            if (parts.length === 2) {
                collar = parts[0];
                shoulder = 'reglan';
                designPart = parts[1];
            } else {
                hasNamingError = true;
            }
        } else {
            hasNamingError = true;
        }
        
        if (hasNamingError) {
            fileErrors.push('Filename does not follow convention: <collar_type>_<shoulder_type>_<design_name>.svg');
        } else {
            // Validate collar type
            const validCollars = ['insert', 'round', 'v_neck', 'v_neck_crossed'];
            if (!validCollars.includes(collar)) {
                fileErrors.push(`Invalid collar type: "${collar}" (must be one of: ${validCollars.join(', ')})`);
            }
            
            // Validate shoulder type
            const validShoulders = ['set_in', 'reglan'];
            if (!validShoulders.includes(shoulder)) {
                fileErrors.push(`Invalid shoulder type: "${shoulder}" (must be one of: ${validShoulders.join(', ')})`);
            }
            
            // Validate design name (should be meaningful, not just numbers)
            if (!designPart || designPart.length === 0) {
                fileErrors.push('Design name is missing');
            } else {
                // Check if design name is just numbers (like design1, design2)
                const numberPattern = /^(design)?\d+$/;
                if (numberPattern.test(designPart)) {
                    fileErrors.push(`Design name "${designPart}" is not meaningful (avoid numbers like design1, design2)`);
                }
                
                // Check design name consistency across all files
                if (hasInconsistentDesignNames && expectedDesignName) {
                    if (designPart !== expectedDesignName) {
                        fileErrors.push(`Design name "${designPart}" does not match expected design name "${expectedDesignName}" (all files must use the same design name)`);
                    }
                }
            }
        }
        
        // Check SVG dimensions (1024x1024 or 2048x2048)
        try {
            const svgDimensions = await getSVGDimensions(file);
            if (svgDimensions) {
                const { width, height } = svgDimensions;
                const validSizes = [
                    { w: 1024, h: 1024 },
                    { w: 2048, h: 2048 }
                ];
                
                const isValidSize = validSizes.some(size => width === size.w && height === size.h);
                
                if (!isValidSize) {
                    fileErrors.push(`SVG dimensions are ${width}x${height} (must be 1024x1024 or 2048x2048)`);
                }
            } else {
                fileErrors.push('Could not read SVG dimensions');
            }
        } catch (error) {
            fileErrors.push(`Error reading SVG: ${error.message}`);
        }
        
        if (fileErrors.length > 0) {
            errors.push({
                filename: filename,
                errors: fileErrors
            });
        }
    }
    
    // Add design name consistency summary if there are inconsistencies
    if (hasInconsistentDesignNames) {
        const inconsistentFiles = [];
        designNamesMap.forEach((designName, fileName) => {
            if (designName !== expectedDesignName) {
                inconsistentFiles.push({ fileName, designName });
            }
        });
        
        if (inconsistentFiles.length > 0) {
            // Add summary error showing which files have wrong design names
            const summaryErrors = [
                `Found ${uniqueDesignNames.length} different design names: ${uniqueDesignNames.join(', ')}`,
                `Expected design name: "${expectedDesignName}" (appears in ${maxCount} files)`,
                '',
                'Files with inconsistent design names:',
                ...inconsistentFiles.map(f => `  • ${f.fileName}: has "${f.designName}" (expected "${expectedDesignName}")`)
            ];
            
            errors.push({
                filename: 'Design Name Consistency',
                errors: summaryErrors
            });
        }
    }
    
    // Show validation errors if any
    if (errors.length > 0) {
        showValidationErrors(errors);
    } else {
        console.log('✓ All files passed validation');
        if (expectedDesignName) {
            console.log(`✓ Design name consistency: All files use "${expectedDesignName}"`);
        }
    }
}

// Get SVG dimensions
function getSVGDimensions(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const svgText = e.target.result;
                const parser = new DOMParser();
                const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
                const svgElement = svgDoc.querySelector('svg');
                
                if (!svgElement) {
                    resolve(null);
                    return;
                }
                
                // Get width and height from attributes or viewBox
                let width = svgElement.getAttribute('width');
                let height = svgElement.getAttribute('height');
                
                // If width/height are not in attributes, try viewBox
                if (!width || !height) {
                    const viewBox = svgElement.getAttribute('viewBox');
                    if (viewBox) {
                        const parts = viewBox.split(' ');
                        if (parts.length >= 4) {
                            width = parts[2];
                            height = parts[3];
                        }
                    }
                }
                
                // Remove units (px, etc.) and convert to number
                width = parseFloat(width);
                height = parseFloat(height);
                
                if (isNaN(width) || isNaN(height)) {
                    resolve(null);
                } else {
                    resolve({ width: Math.round(width), height: Math.round(height) });
                }
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = () => {
            reject(new Error('Failed to read file'));
        };
        
        reader.readAsText(file);
    });
}

// Show validation errors in modal
function showValidationErrors(errors) {
    const modal = document.getElementById('validation-modal');
    const body = document.getElementById('validation-body');
    const closeBtn = document.getElementById('validation-close');
    const okBtn = document.getElementById('validation-ok');
    
    // Clear previous content
    body.innerHTML = '';
    
    // Add error items
    errors.forEach(error => {
        const errorItem = document.createElement('div');
        errorItem.className = 'validation-error-item';
        
        const fileName = document.createElement('div');
        fileName.className = 'validation-error-file';
        fileName.textContent = error.filename;
        
        const errorList = document.createElement('ul');
        errorList.className = 'validation-error-list';
        error.errors.forEach(err => {
            const li = document.createElement('li');
            li.textContent = err;
            errorList.appendChild(li);
        });
        
        errorItem.appendChild(fileName);
        errorItem.appendChild(errorList);
        body.appendChild(errorItem);
    });
    
    // Show modal
    modal.style.display = 'flex';
    
    // Close handlers
    const closeModal = () => {
        modal.style.display = 'none';
    };
    
    closeBtn.addEventListener('click', closeModal);
    okBtn.addEventListener('click', closeModal);
    
    // Close on overlay click
    modal.querySelector('.validation-overlay').addEventListener('click', closeModal);
}

// Helper function to get model path (from threeD-script.js)
function getModelPath(collar, shoulder) {
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

    const key = `${collar}_${shoulder}`;
    const filename = MODEL_MAP[key];

    if (!filename) {
        console.warn(`No model found for ${collar} + ${shoulder}, using default`);
        return './models/insert_collar_reglan_01.glb';
    }

    return `./models/${filename}`;
}

