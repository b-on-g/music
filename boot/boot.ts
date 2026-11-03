namespace $ {

	export class $bog_music_boot extends $mol_object {

		static share_token = ''

		static init() {
			$bog_music_stream.install_page()
			if( typeof location === 'undefined' ) return
			$bog_music_log.init()
			$bog_music_log.act( 'запуск приложения' )
			this.import_account_hash()
			this.parse_share_hash()
		}

		static import_account_hash() {
			const hash = location.hash || ''
			const match = hash.match( /[#&]account=([^&]+)/ )
			if( !match ) return
			const key = decodeURIComponent( match[ 1 ] )
			if( key.length < 172 ) {
				console.warn( '[boot] account key too short, ignoring' )
				return
			}
			const current = $mol_state_local.value( '$giper_baza_auth' )
			$mol_state_local.value( '$giper_baza_auth', key )
			this.hash_drop( 'account' )
			if( current !== key ) location.reload()
		}

		static parse_share_hash() {
			const match = ( location.hash || '' ).match( /[#&]share=([^&]+)/ )
			if( match ) this.share_token = decodeURIComponent( match[ 1 ] )
		}

		static clear_share_hash() {
			this.hash_drop( 'share' )
			this.share_token = ''
		}

		static hash_drop( name: string ) {
			const hash = ( location.hash || '' )
				.replace( new RegExp( `[#&]?${ name }=[^&]*` ), '' )
				.replace( /^#&/, '#' )
			const url = location.origin + location.pathname + location.search
				+ ( hash && hash !== '#' ? hash : '' )
			history.replaceState( null, '', url )
		}

	}

}
