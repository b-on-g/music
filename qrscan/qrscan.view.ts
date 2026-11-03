namespace $.$$ {

	const qr_module = require( 'jsqr/dist/jsQR.js' ) as Qr_read & { default?: Qr_read }
	const qr_read = qr_module.default ?? qr_module
	type Qr_read = typeof import(
		'jsqr'
	).default

	export class $bog_music_qrscan extends $.$bog_music_qrscan {

		sub() {
			return this.scanning() ? [ this.Toggle(), this.Camera() ] : [ this.Toggle() ]
		}

		@ $mol_mem
		canvas() {
			return $mol_dom_context.document.createElement( 'canvas' )
		}

		@ $mol_mem
		tick() {
			if( !this.scanning() ) return null
			$mol_state_time.now( 250 )
			const video = this.Camera().dom_node() as HTMLVideoElement
			const width = video.videoWidth
			const height = video.videoHeight
			if( !width || !height ) return null
			const canvas = this.canvas()
			canvas.width = width
			canvas.height = height
			const context = canvas.getContext( '2d', { willReadFrequently: true } )!
			context.drawImage( video, 0, 0, width, height )
			const found = qr_read( context.getImageData( 0, 0, width, height ).data, width, height )
			if( !found?.data.includes( this.prefix() ) ) return null
			setTimeout( () => {
				this.scanning( false )
				this.found( found.data )
			} )
			return found.data
		}

		auto() {
			this.tick()
		}

	}

}
