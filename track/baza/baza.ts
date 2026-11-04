namespace $ {

	export interface $bog_music_track_baza_info {
		title: string
		artist: string
		duration: number
		cover: string
	}

	export class $bog_music_track_baza extends $giper_baza_dict.with({
		Title: $giper_baza_atom.of( $mol_schema_string ),
		Artist: $giper_baza_atom.of( $mol_schema_string ),
		Duration: $giper_baza_atom.of( $mol_schema_float ),
		Added: $giper_baza_atom.of( $mol_schema_float ),
		Order: $giper_baza_atom.of( $mol_schema_float ),
		Playlist: $giper_baza_atom.of( $mol_schema_string ),
		Holders: $giper_baza_list_str,
		Trim_start: $giper_baza_atom.of( $mol_schema_float ),
		Trim_end: $giper_baza_atom.of( $mol_schema_float ),
		Lufs: $giper_baza_atom.of( $mol_schema_float ),
		Cover: $giper_baza_atom.of( $mol_schema_string ),
	}) {

		info(): $bog_music_track_baza_info | null {
			const title = this.Title()?.val()
			if( title == null ) return null
			return {
				title,
				artist: this.Artist()?.val() ?? '',
				duration: this.Duration()?.val() ?? 0,
				cover: this.cover(),
			}
		}

		cover(): string {
			return String( this.Cover()?.val() ?? '' )
		}

		playlist(): string {
			return this.Playlist()?.val() ?? ''
		}

		added(): number {
			return Number( this.Added()?.val() ?? 0 )
		}

		order(): number {
			const raw = this.Order()?.val()
			return raw == null ? this.added() : Number( raw )
		}

		order_set( next: number ) {
			this.Order( 'auto' )!.val( next )
		}

		holders(): string[] {
			return ( this.Holders()?.items() ?? [] ) as string[]
		}

		@ $mol_action
		holder_add( device: string ) {
			if( this.holders().includes( device ) ) return
			this.Holders( 'auto' )!.add( device )
		}

		@ $mol_action
		holder_cut( device: string ) {
			if( !this.holders().includes( device ) ) return
			this.Holders( 'auto' )!.cut( device )
		}

		lufs( next?: number ): number | null {
			if( next !== undefined ) this.Lufs( 'auto' )!.val( next )
			const v = this.Lufs()?.val()
			return v == null ? null : Number( v )
		}

		trim_start( next?: number ): number {
			if( next !== undefined ) this.Trim_start( 'auto' )!.val( Math.max( 0, next ) )
			const v = Number( this.Trim_start()?.val() ?? 0 )
			return Number.isFinite( v ) && v > 0 ? v : 0
		}

		trim_end( fallback: number, next?: number ): number {
			if( next !== undefined ) this.Trim_end( 'auto' )!.val( Math.max( 0, next ) )
			const raw = this.Trim_end()?.val()
			if( raw == null ) return fallback
			const v = Number( raw )
			return Number.isFinite( v ) && v > 0 ? v : fallback
		}

	}

	export class $bog_music_track_baza_dict extends $giper_baza_dict_to( $bog_music_track_baza ) {}

}
