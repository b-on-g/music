namespace $ {

	export class $bog_music_device extends $mol_object {

		@ $mol_mem
		static id() {
			const stored = this.$.$mol_state_local.value< string >( 'bog_music_device' )
			if( stored ) return stored
			const id = $mol_guid( 12 )
			this.$.$mol_state_local.value( 'bog_music_device', id )
			return id
		}

		static title_of( agent: string, touch = 0, side = 0 ) {
			const mac = /Mac OS X/.test( agent ) && !/iPhone|iPad/.test( agent )
			const os = /iPhone/.test( agent ) ? 'iPhone'
				: /iPad/.test( agent ) ? 'iPad'
				: mac && touch > 1 ? ( side && side < 600 ? 'iPhone' : 'iPad' )
				: /Android/.test( agent ) ? 'Android'
				: mac ? 'Mac'
				: /Windows/.test( agent ) ? 'Windows'
				: /Linux/.test( agent ) ? 'Linux'
				: 'Устройство'
			const browser = /Edg\//.test( agent ) ? 'Edge'
				: /Firefox\//.test( agent ) ? 'Firefox'
				: /Chrome\//.test( agent ) ? 'Chrome'
				: /Safari\//.test( agent ) ? 'Safari'
				: ''
			return browser ? `${ os } · ${ browser }` : os
		}

		static title() {
			if( typeof navigator === 'undefined' ) return this.title_of( '' )
			const side = typeof screen === 'undefined' ? 0 : Math.min( screen.width, screen.height )
			return this.title_of( navigator.userAgent, navigator.maxTouchPoints ?? 0, side )
		}

	}

	export class $bog_music_device_baza extends $giper_baza_dict.with({
		Name: $giper_baza_atom.of( $mol_schema_string ),
		Beat: $giper_baza_atom.of( $mol_schema_float ),
	}) {

		name() {
			return this.Name()?.val() ?? 'Устройство'
		}

		beat() {
			return Number( this.Beat()?.val() ?? 0 )
		}

	}

	export class $bog_music_device_dict extends $giper_baza_dict_to( $bog_music_device_baza ) {}

	export class $bog_music_device_signals extends $giper_baza_dict_to( $giper_baza_atom_text ) {}

}
