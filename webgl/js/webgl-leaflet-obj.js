// WebGL - load obj - w/mtl, normal maps
// from https://webglfundamentals.org/webgl/webgl-load-obj-w-mtl-w-normal-maps.html

"use strict";

// This is not a full .obj parser.
// see http://paulbourke.net/dataformats/obj/

function parseOBJ(text) {
    // because indices are base 1 let's just fill in the 0th data
    const objPositions = [[0, 0, 0]];
    const objTexcoords = [[0, 0]];
    const objNormals = [[0, 0, 0]];
    const objColors = [[0, 0, 0]];

    // same order as `f` indices
    const objVertexData = [
        objPositions,
        objTexcoords,
        objNormals,
        objColors,
    ];

    // same order as `f` indices
    let webglVertexData = [
        [],   // positions
        [],   // texcoords
        [],   // normals
        [],   // colors
    ];

    const materialLibs = [];
    const geometries = [];
    let geometry;
    let groups = ['default'];
    let material = 'default';
    let object = 'default';

    const noop = () => { };

    function newGeometry() {
        // If there is an existing geometry and it's
        // not empty then start a new one.
        if (geometry && geometry.data.position.length) {
            geometry = undefined;
        }
    }

    function setGeometry() {
        if (!geometry) {
            const position = [];
            const texcoord = [];
            const normal = [];
            const color = [];
            webglVertexData = [
                position,
                texcoord,
                normal,
                color,
            ];
            geometry = {
                object,
                groups,
                material,
                data: {
                    position,
                    texcoord,
                    normal,
                    color,
                },
            };
            geometries.push(geometry);
        }
    }

    function addVertex(vert) {
        const ptn = vert.split('/');
        ptn.forEach((objIndexStr, i) => {
            if (!objIndexStr) {
                return;
            }
            const objIndex = parseInt(objIndexStr);
            const index = objIndex + (objIndex >= 0 ? 0 : objVertexData[i].length);
            webglVertexData[i].push(...objVertexData[i][index]);
            // if this is the position index (index 0) and we parsed
            // vertex colors then copy the vertex colors to the webgl vertex color data
            if (i === 0 && objColors.length > 1) {
                geometry.data.color.push(...objColors[index]);
            }
        });
    }

    const keywords = {
        v(parts) {
            // if there are more than 3 values here they are vertex colors
            if (parts.length > 3) {
                objPositions.push(parts.slice(0, 3).map(parseFloat));
                objColors.push(parts.slice(3).map(parseFloat));
            } else {
                objPositions.push(parts.map(parseFloat));
            }
        },
        vn(parts) {
            objNormals.push(parts.map(parseFloat));
        },
        vt(parts) {
            // should check for missing v and extra w?
            objTexcoords.push(parts.map(parseFloat));
        },
        f(parts) {
            setGeometry();
            const numTriangles = parts.length - 2;
            for (let tri = 0; tri < numTriangles; ++tri) {
                addVertex(parts[0]);
                addVertex(parts[tri + 1]);
                addVertex(parts[tri + 2]);
            }
        },
        s: noop,    // smoothing group
        mtllib(parts, unparsedArgs) {
            // the spec says there can be multiple filenames here
            // but many exist with spaces in a single filename
            materialLibs.push(unparsedArgs);
        },
        usemtl(parts, unparsedArgs) {
            material = unparsedArgs;
            newGeometry();
        },
        g(parts) {
            groups = parts;
            newGeometry();
        },
        o(parts, unparsedArgs) {
            object = unparsedArgs;
            newGeometry();
        },
    };

    const keywordRE = /(\w*)(?: )*(.*)/;
    const lines = text.split('\n');
    for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
        const line = lines[lineNo].trim();
        if (line === '' || line.startsWith('#')) {
            continue;
        }
        const m = keywordRE.exec(line);
        if (!m) {
            continue;
        }
        const [, keyword, unparsedArgs] = m;
        const parts = line.split(/\s+/).slice(1);
        const handler = keywords[keyword];
        if (!handler) {
            console.warn('unhandled keyword:', keyword);  // eslint-disable-line no-console
            continue;
        }
        handler(parts, unparsedArgs);
    }

    // remove any arrays that have no entries.
    for (const geometry of geometries) {
        geometry.data = Object.fromEntries(
            Object.entries(geometry.data).filter(([, array]) => array.length > 0));
    }

    return {
        geometries,
        materialLibs,
    };
}

function parseMapArgs(unparsedArgs) {
    // TODO: handle options
    return unparsedArgs;
}

function parseMTL(text) {
    const materials = {};
    let material;

    const keywords = {
        newmtl(parts, unparsedArgs) {
            material = {};
            materials[unparsedArgs] = material;
        },
        /* eslint brace-style:0 */
        Ns(parts) { material.shininess = parseFloat(parts[0]); },
        Ka(parts) { material.ambient = parts.map(parseFloat); },
        Kd(parts) { material.diffuse = parts.map(parseFloat); },
        Ks(parts) { material.specular = parts.map(parseFloat); },
        Ke(parts) { material.emissive = parts.map(parseFloat); },
        map_Kd(parts, unparsedArgs) { material.diffuseMap = parseMapArgs(unparsedArgs); },
        map_Ns(parts, unparsedArgs) { material.specularMap = parseMapArgs(unparsedArgs); },
        map_Bump(parts, unparsedArgs) { material.normalMap = parseMapArgs(unparsedArgs); },
        Ni(parts) { material.opticalDensity = parseFloat(parts[0]); },
        d(parts) { material.opacity = parseFloat(parts[0]); },
        illum(parts) { material.illum = parseInt(parts[0]); },
    };

    const keywordRE = /(\w*)(?: )*(.*)/;
    const lines = text.split('\n');
    for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
        const line = lines[lineNo].trim();
        if (line === '' || line.startsWith('#')) {
            continue;
        }
        const m = keywordRE.exec(line);
        if (!m) {
            continue;
        }
        const [, keyword, unparsedArgs] = m;
        const parts = line.split(/\s+/).slice(1);
        const handler = keywords[keyword];
        if (!handler) {
            console.warn('unhandled keyword:', keyword);
            continue;
        }
        handler(parts, unparsedArgs);
    }

    return materials;
}

function isPowerOf2(value) {
    return (value & (value - 1)) === 0;
}

function create1PixelTexture(gl, pixel) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array(pixel));
    return texture;
}

function createTexture(gl, url) {
    const texture = create1PixelTexture(gl, [128, 192, 255, 255]);
    // Asynchronously load an image
    const image = new Image();
    requestCORSIfNotSameOrigin(image, url)
    image.src = url;
    image.addEventListener('load', function () {
        // Now that the image has loaded make copy it to the texture.
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

        // Check if the image is a power of 2 in both dimensions.
        if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
            // Yes, it's a power of 2. Generate mips.
            gl.generateMipmap(gl.TEXTURE_2D);
        } else {
            // No, it's not a power of 2. Turn of mips and set wrapping to clamp to edge
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        }
    });
    return texture;
}

function makeIndexIterator(indices) {
    let ndx = 0;
    const fn = () => indices[ndx++];
    fn.reset = () => { ndx = 0; };
    fn.numElements = indices.length;
    return fn;
}

function makeUnindexedIterator(positions) {
    let ndx = 0;
    const fn = () => ndx++;
    fn.reset = () => { ndx = 0; };
    fn.numElements = positions.length / 3;
    return fn;
}

const subtractVector2 = (a, b) => a.map((v, ndx) => v - b[ndx]);

function generateTangents(position, texcoord, indices) {
    const getNextIndex = indices ? makeIndexIterator(indices) : makeUnindexedIterator(position);
    const numFaceVerts = getNextIndex.numElements;
    const numFaces = numFaceVerts / 3;

    const tangents = [];
    for (let i = 0; i < numFaces; ++i) {
        const n1 = getNextIndex();
        const n2 = getNextIndex();
        const n3 = getNextIndex();

        const p1 = position.slice(n1 * 3, n1 * 3 + 3);
        const p2 = position.slice(n2 * 3, n2 * 3 + 3);
        const p3 = position.slice(n3 * 3, n3 * 3 + 3);

        const uv1 = texcoord.slice(n1 * 2, n1 * 2 + 2);
        const uv2 = texcoord.slice(n2 * 2, n2 * 2 + 2);
        const uv3 = texcoord.slice(n3 * 2, n3 * 2 + 2);

        const dp12 = m4.subtractVectors(p2, p1);
        const dp13 = m4.subtractVectors(p3, p1);

        const duv12 = subtractVector2(uv2, uv1);
        const duv13 = subtractVector2(uv3, uv1);

        const f = 1.0 / (duv12[0] * duv13[1] - duv13[0] * duv12[1]);
        const tangent = Number.isFinite(f)
            ? m4.normalize(m4.scaleVector(m4.subtractVectors(
                m4.scaleVector(dp12, duv13[1]),
                m4.scaleVector(dp13, duv12[1]),
            ), f))
            : [1, 0, 0];

        tangents.push(...tangent, ...tangent, ...tangent);
    }

    return tangents;
}

async function main(gl) {
    console.log("main");

    if (!gl) {
        return;
    }

    const vs = `
  attribute vec4 a_position;
  attribute vec3 a_normal;
  attribute vec3 a_tangent;
  attribute vec2 a_texcoord;
  attribute vec4 a_color;

  uniform mat4 u_projection;
  uniform mat4 u_view;
  uniform mat4 u_world;
  uniform vec3 u_viewWorldPosition;

  varying vec3 v_normal;
  varying vec3 v_tangent;
  varying vec3 v_surfaceToView;
  varying vec2 v_texcoord;
  varying vec4 v_color;

  void main() {
    vec4 worldPosition = u_world * a_position;
    gl_Position = u_projection * u_view * worldPosition;
    v_surfaceToView = u_viewWorldPosition - worldPosition.xyz;
    mat3 normalMat = mat3(u_world);
    v_normal = normalize(normalMat * a_normal);
    v_tangent = normalize(normalMat * a_tangent);

    v_texcoord = a_texcoord;
    v_color = a_color;
  }
  `;

    const fs = `
  precision highp float;

  varying vec3 v_normal;
  varying vec3 v_tangent;
  varying vec3 v_surfaceToView;
  varying vec2 v_texcoord;
  varying vec4 v_color;

  uniform vec3 diffuse;
  uniform sampler2D diffuseMap;
  uniform vec3 ambient;
  uniform vec3 emissive;
  uniform vec3 specular;
  uniform sampler2D specularMap;
  uniform float shininess;
  uniform sampler2D normalMap;
  uniform float opacity;
  uniform vec3 u_lightDirection;
  uniform vec3 u_ambientLight;

  void main () {
    vec3 normal = normalize(v_normal) * ( float( gl_FrontFacing ) * 2.0 - 1.0 );
    vec3 tangent = normalize(v_tangent) * ( float( gl_FrontFacing ) * 2.0 - 1.0 );
    vec3 bitangent = normalize(cross(normal, tangent));

    mat3 tbn = mat3(tangent, bitangent, normal);
    normal = texture2D(normalMap, v_texcoord).rgb * 2. - 1.;
    normal = normalize(tbn * normal);

    vec3 surfaceToViewDirection = normalize(v_surfaceToView);
    vec3 halfVector = normalize(u_lightDirection + surfaceToViewDirection);

    float fakeLight = dot(u_lightDirection, normal) * .5 + .5;
    float specularLight = clamp(dot(normal, halfVector), 0.0, 1.0);
    vec4 specularMapColor = texture2D(specularMap, v_texcoord);
    vec3 effectiveSpecular = specular * specularMapColor.rgb;

    vec4 diffuseMapColor = texture2D(diffuseMap, v_texcoord);
    vec3 effectiveDiffuse = diffuse * diffuseMapColor.rgb * v_color.rgb;
    float effectiveOpacity = opacity * diffuseMapColor.a * v_color.a;

    gl_FragColor = vec4(
        emissive +
        ambient * u_ambientLight +
        effectiveDiffuse * fakeLight +
        effectiveSpecular * pow(specularLight, shininess),
        effectiveOpacity);
  }
  `;


    // compiles and links the shaders, looks up attribute and uniform locations
    const meshProgramInfo = webglUtils.createProgramInfo(gl, [vs, fs]);

    const objHref = '../public/Windmill/windmill.obj';
    const response = await fetch(objHref);

    if (response.status !== 200) {
        console.error("ERROR: Returned a non-200 code");
        if (response.status === 404) {
            console.error("ERROR: OBJ file not found");
        }
        return;
    }

    const text = await response.text();
    const obj = parseOBJ(text);
    const baseHref = new URL(objHref, window.location.href);
    const matTexts = await Promise.all(obj.materialLibs.map(async filename => {
        const matHref = new URL(filename, baseHref).href;
        const response = await fetch(matHref);
        return await response.text();
    }));
    const materials = parseMTL(matTexts.join('\n'));

    const textures = {
        defaultWhite: create1PixelTexture(gl, [255, 255, 255, 255]),
        defaultNormal: create1PixelTexture(gl, [127, 127, 255, 0]),
    };

    // load texture for materials
    for (const material of Object.values(materials)) {
        Object.entries(material)
            .filter(([key]) => key.endsWith('Map'))
            .forEach(([key, filename]) => {
                let texture = textures[filename];
                if (!texture) {
                    const textureHref = new URL(filename, baseHref).href;
                    texture = createTexture(gl, textureHref);
                    textures[filename] = texture;
                }
                material[key] = texture;
            });
    }

    // hack the materials so we can see the specular map
    Object.values(materials).forEach(m => {
        m.shininess = 25;
        m.specular = [3, 2, 1];
    });

    const defaultMaterial = {
        diffuse: [1, 1, 1],
        diffuseMap: textures.defaultWhite,
        normalMap: textures.defaultNormal,
        ambient: [0, 0, 0],
        specular: [1, 1, 1],
        specularMap: textures.defaultWhite,
        shininess: 400,
        opacity: 1,
    };

    const parts = obj.geometries.map(({ material, data }) => {
        // Because data is just named arrays like this
        //
        // {
        //   position: [...],
        //   texcoord: [...],
        //   normal: [...],
        // }
        //
        // and because those names match the attributes in our vertex
        // shader we can pass it directly into `createBufferInfoFromArrays`
        // from the article "less code more fun".

        if (data.color) {
            if (data.position.length === data.color.length) {
                // it's 3. The our helper library assumes 4 so we need
                // to tell it there are only 3.
                data.color = { numComponents: 3, data: data.color };
            }
        } else {
            // there are no vertex colors so just use constant white
            data.color = { value: [1, 1, 1, 1] };
        }

        // generate tangents if we have the data to do so.
        if (data.texcoord && data.normal) {
            data.tangent = generateTangents(data.position, data.texcoord);
        } else {
            // There are no tangents
            data.tangent = { value: [1, 0, 0] };
        }

        if (!data.texcoord) {
            data.texcoord = { value: [0, 0] };
        }

        if (!data.normal) {
            // we probably want to generate normals if there are none
            data.normal = { value: [0, 0, 1] };
        }

        // create a buffer for each array by calling
        // gl.createBuffer, gl.bindBuffer, gl.bufferData
        const bufferInfo = webglUtils.createBufferInfoFromArrays(gl, data);
        return {
            material: {
                ...defaultMaterial,
                ...materials[material],
            },
            bufferInfo,
        };
    });

    function getExtents(positions) {
        const min = positions.slice(0, 3);
        const max = positions.slice(0, 3);
        for (let i = 3; i < positions.length; i += 3) {
            for (let j = 0; j < 3; ++j) {
                const v = positions[i + j];
                min[j] = Math.min(v, min[j]);
                max[j] = Math.max(v, max[j]);
            }
        }
        return { min, max };
    }

    function getGeometriesExtents(geometries) {
        return geometries.reduce(({ min, max }, { data }) => {
            const minMax = getExtents(data.position);
            return {
                min: min.map((min, ndx) => Math.min(minMax.min[ndx], min)),
                max: max.map((max, ndx) => Math.max(minMax.max[ndx], max)),
            };
        }, {
            min: Array(3).fill(Number.POSITIVE_INFINITY),
            max: Array(3).fill(Number.NEGATIVE_INFINITY),
        });
    }

    const extents = getGeometriesExtents(obj.geometries);
    const range = m4.subtractVectors(extents.max, extents.min);
    // amount to move the object so its center is at the origin
    const objOffset = m4.scaleVector(
        m4.addVectors(
            extents.min,
            m4.scaleVector(range, 0.5)),
        -1);
    const cameraTarget = [0, 0, 0];
    // figure out how far away to move the camera so we can likely
    // see the object.
    const radius = m4.length(range) * 1.2;
    const cameraPosition = m4.addVectors(cameraTarget, [
        0,
        0,
        radius,
    ]);
    // Set zNear and zFar to something hopefully appropriate
    // for the size of this object.
    const zNear = radius / 100;
    const zFar = radius * 3;

    function degToRad(deg) {
        return deg * Math.PI / 180;
    }

    function render(time) {
        time *= 0.001;  // convert to seconds

        webglUtils.resizeCanvasToDisplaySize(gl.canvas);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        gl.clearColor(0, 0, 0, 1); // Background Color
        gl.enable(gl.DEPTH_TEST);
        gl.clear(gl.COLOR_BUFFER_BIT);

        const fieldOfViewRadians = degToRad(60);
        const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
        const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);

        const up = [0, 1, 0];
        // Compute the camera's matrix using look at.
        const camera = m4.lookAt(cameraPosition, cameraTarget, up);

        // Make a view matrix from the camera matrix.
        const view = m4.inverse(camera);

        const sharedUniforms = {
            u_lightDirection: m4.normalize([-1, 3, 5]),
            u_view: view,
            u_projection: projection,
            u_viewWorldPosition: cameraPosition,
        };

        gl.useProgram(meshProgramInfo.program);

        // calls gl.uniform
        webglUtils.setUniforms(meshProgramInfo, sharedUniforms);

        // compute the world matrix once since all parts
        // are at the same space.
        // let u_world = m4.yRotation(time);
        let u_world = m4.identity();
        u_world = m4.translate(u_world, ...objOffset);

        for (const { bufferInfo, material } of parts) {
            // calls gl.bindBuffer, gl.enableVertexAttribArray, gl.vertexAttribPointer
            webglUtils.setBuffersAndAttributes(gl, meshProgramInfo, bufferInfo);
            // calls gl.uniform
            webglUtils.setUniforms(meshProgramInfo, {
                u_world,
            }, material);
            // calls gl.drawArrays or gl.drawElements
            webglUtils.drawBufferInfo(gl, bufferInfo);
        }

        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
}

/**
 * create the "map" and disable dragging and zooming
 * disabling dragging and zooming is a workaround to prevent render "crash"
 * TO FIX: the rendering "crashes" when a resizing is made
 * The resize is caused also by zoom, dragging and double click
 * A not-navigation provider does not need them
 */
var leafletMap = L.map('map', { zoomControl: false}).setView([50.00, 14.44], 9);
leafletMap.dragging.disable(); 

L.canvasLayer()
    .delegate(this) // -- if we do not inherit from L.CanvasLayer we can setup a delegate to receive events from L.CanvasLayer
    .addTo(leafletMap);

function onDrawLayer(info) {
    console.log("onDrawLayer")
    var gl = info.canvas.getContext('webgl');
    main(gl);
}

function onMapClick(e) {
    console.log("You clicked the map at " + e.latlng.toString());

    let trigger = true;
    if (trigger) {
        var lat = e.latlng["lat"];
        var lng = e.latlng["lng"];

        var pos = L.latLng([lat, lng]);
        L.marker(pos).addTo(leafletMap);
    }
}

leafletMap.on('click', onMapClick);

// This is needed if the images are not on the same domain
// See: https://webglfundamentals.org/webgl/lessons/webgl-cors-permission.html
function requestCORSIfNotSameOrigin(img, url) {
    if ((new URL(url, window.location.href)).origin !== window.location.origin) {
        img.crossOrigin = "";
    }
}