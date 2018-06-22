import { WebGLRenderTarget } from '../renderers/WebGLRenderTarget.js'
import { OrthographicCamera } from '../cameras/OrthographicCamera.js'
import { Scene } from '../scenes/Scene.js'
import { PlaneBufferGeometry } from '../geometries/PlaneGeometry.js'
import { Vector2 } from '../math/Vector2.js'
import { Mesh } from '../objects/Mesh.js'
import { ShaderMaterial } from '../materials/ShaderMaterial.js'
import { Vector3 } from '../math/Vector3.js'
import {
	BackSide,
	CustomBlending,
	AddEquation,
	ZeroFactor,
	OneFactor,
	LinearToneMapping,
	CubeUVReflectionMapping,
	LinearFilter,
	RGBEEncoding,
	RGBM16Encoding
} from '../constants.js'



var PMREMCubeUVPacker = function ( cubeTextureLods ) {

	this.cubeLods = cubeTextureLods;
	var size = cubeTextureLods[ 0 ].width * 4;

	var sourceTexture = cubeTextureLods[ 0 ].texture;
	var params = {
		format: sourceTexture.format,
		magFilter: sourceTexture.magFilter,
		minFilter: sourceTexture.minFilter,
		type: sourceTexture.type,
		generateMipmaps: sourceTexture.generateMipmaps,
		anisotropy: sourceTexture.anisotropy,
		encoding: ( sourceTexture.encoding === RGBEEncoding ) ? RGBM16Encoding : sourceTexture.encoding
	};

	if ( params.encoding === RGBM16Encoding ) {

		params.magFilter = LinearFilter;
		params.minFilter = LinearFilter;

	}

	this.CubeUVRenderTarget = new WebGLRenderTarget( size, size, params );
	this.CubeUVRenderTarget.texture.name = "PMREMCubeUVPacker.cubeUv";
	this.CubeUVRenderTarget.texture.mapping = CubeUVReflectionMapping;
	this.camera = new OrthographicCamera( - size * 0.5, size * 0.5, - size * 0.5, size * 0.5, 0, 1 ); // top and bottom are swapped for some reason?

	this.scene = new Scene();

	this.objects = [];

	var geometry = new PlaneBufferGeometry( 1, 1 );

	var faceOffsets = [];
	faceOffsets.push( new Vector2( 0, 0 ) );
	faceOffsets.push( new Vector2( 1, 0 ) );
	faceOffsets.push( new Vector2( 2, 0 ) );
	faceOffsets.push( new Vector2( 0, 1 ) );
	faceOffsets.push( new Vector2( 1, 1 ) );
	faceOffsets.push( new Vector2( 2, 1 ) );

	var textureResolution = size;
	size = cubeTextureLods[ 0 ].width;

	var offset2 = 0;
	var c = 4.0;
	this.numLods = Math.log( cubeTextureLods[ 0 ].width ) / Math.log( 2 ) - 2; // IE11 doesn't support Math.log2
	for ( var i = 0; i < this.numLods; i ++ ) {

		var offset1 = ( textureResolution - textureResolution / c ) * 0.5;
		if ( size > 16 ) c *= 2;
		var nMips = size > 16 ? 6 : 1;
		var mipOffsetX = 0;
		var mipOffsetY = 0;
		var mipSize = size;

		for ( var j = 0; j < nMips; j ++ ) {

			// Mip Maps
			for ( var k = 0; k < 6; k ++ ) {

				// 6 Cube Faces
				var material = this.getShader();
				material.uniforms[ 'envMap' ].value = this.cubeLods[ i ].texture;
				material.envMap = this.cubeLods[ i ].texture;
				material.uniforms[ 'faceIndex' ].value = k;
				material.uniforms[ 'mapSize' ].value = mipSize;

				var planeMesh = new Mesh( geometry, material );
				planeMesh.position.x = faceOffsets[ k ].x * mipSize - offset1 + mipOffsetX;
				planeMesh.position.y = faceOffsets[ k ].y * mipSize - offset1 + offset2 + mipOffsetY;
				planeMesh.material.side = BackSide;
				planeMesh.scale.setScalar( mipSize );
				this.scene.add( planeMesh );
				this.objects.push( planeMesh );

			}
			mipOffsetY += 1.75 * mipSize;
			mipOffsetX += 1.25 * mipSize;
			mipSize /= 2;

		}
		offset2 += 2 * size;
		if ( size > 16 ) size /= 2;

	}

};

PMREMCubeUVPacker.prototype = {

	constructor: PMREMCubeUVPacker,

	update: function ( renderer ) {

		var gammaInput = renderer.gammaInput;
		var gammaOutput = renderer.gammaOutput;
		var toneMapping = renderer.toneMapping;
		var toneMappingExposure = renderer.toneMappingExposure;
		var currentRenderTarget = renderer.getRenderTarget();

		renderer.gammaInput = false;
		renderer.gammaOutput = false;
		renderer.toneMapping = LinearToneMapping;
		renderer.toneMappingExposure = 1.0;
		renderer.render( this.scene, this.camera, this.CubeUVRenderTarget, false );

		renderer.setRenderTarget( currentRenderTarget );
		renderer.toneMapping = toneMapping;
		renderer.toneMappingExposure = toneMappingExposure;
		renderer.gammaInput = gammaInput;
		renderer.gammaOutput = gammaOutput;

	},

	getShader: function () {

		var shaderMaterial = new ShaderMaterial( {

			uniforms: {
				"faceIndex": { value: 0 },
				"mapSize": { value: 0 },
				"envMap": { value: null },
				"testColor": { value: new Vector3( 1, 1, 1 ) }
			},

			vertexShader:
				"precision highp float;\
				varying vec2 vUv;\
				void main() {\
					vUv = uv;\
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\
				}",

			fragmentShader:
				"precision highp float;\
				varying vec2 vUv;\
				uniform samplerCube envMap;\
				uniform float mapSize;\
				uniform vec3 testColor;\
				uniform int faceIndex;\
				\
				void main() {\
					vec3 sampleDirection;\
					vec2 uv = vUv;\
					uv = uv * 2.0 - 1.0;\
					uv.y *= -1.0;\
					if(faceIndex == 0) {\
						sampleDirection = normalize(vec3(1.0, uv.y, -uv.x));\
					} else if(faceIndex == 1) {\
						sampleDirection = normalize(vec3(uv.x, 1.0, uv.y));\
					} else if(faceIndex == 2) {\
						sampleDirection = normalize(vec3(uv.x, uv.y, 1.0));\
					} else if(faceIndex == 3) {\
						sampleDirection = normalize(vec3(-1.0, uv.y, uv.x));\
					} else if(faceIndex == 4) {\
						sampleDirection = normalize(vec3(uv.x, -1.0, -uv.y));\
					} else {\
						sampleDirection = normalize(vec3(-uv.x, uv.y, -1.0));\
					}\
					vec4 color = envMapTexelToLinear( textureCube( envMap, sampleDirection ) );\
					gl_FragColor = linearToOutputTexel( color );\
				}",

			blending: CustomBlending,
			premultipliedAlpha: false,
			blendSrc: OneFactor,
			blendDst: ZeroFactor,
			blendSrcAlpha: OneFactor,
			blendDstAlpha: ZeroFactor,
			blendEquation: AddEquation

		} );

		shaderMaterial.type = 'PMREMCubeUVPacker';

		return shaderMaterial;

	},

	dispose: function () {

		for ( var i = 0, l = this.objects.length; i < l; i ++ ) {

			this.objects[ i ].material.dispose();

		}

		this.objects[ 0 ].geometry.dispose();

	}

};

export { PMREMCubeUVPacker }
