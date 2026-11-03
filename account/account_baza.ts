namespace $ {

	export type $bog_music_account_place = 'disk' | 'legacy' | 'remote' | 'lost'

	export class $bog_music_account_baza_playlists extends $giper_baza_dict_to( $giper_baza_atom_text ) {}

	export class $bog_music_account_baza_lists extends $giper_baza_dict_to( $giper_baza_list_str ) {}

	export class $bog_music_account_baza extends $giper_baza_dict.with({
		Nickname: $giper_baza_atom.of( $mol_schema_string ),
		Last_track_key: $giper_baza_atom.of( $mol_schema_string ),
		Last_position: $giper_baza_atom.of( $mol_schema_float ),
		Eq_on: $giper_baza_atom.of( $mol_schema_boolean ),
		Eq_gains: $giper_baza_atom.of( $mol_schema_string ),
		Tracks: $bog_music_track_baza_dict,
		Playlists: $bog_music_account_baza_playlists,
		Lists: $bog_music_account_baza_lists,
		Devices: $bog_music_device_dict,
		Signals: $bog_music_device_signals,
	}) {

		static home() {
			return $giper_baza_glob.home().land().Data( $bog_music_account_baza )
		}

		static key_make( source: string ): string {
			return `0_${ this.hash_str( source ) }`
		}

		land_id(): string {
			try { return this.land().link().str } catch { return '' }
		}

		tracks() {
			return this.Tracks( null )!
		}

		track( key: string ) {
			return this.tracks().key( key )
		}

		info( key: string ) {
			return this.track( key )?.info() ?? null
		}

		nickname( next?: string ): string {
			if( next !== undefined ) this.Nickname( 'auto' )!.val( next )
			return this.Nickname()?.val() ?? ''
		}

		keys_in( playlist: string ): string[] {
			const dict = this.tracks()
			const rows: { key: string, order: number, added: number }[] = []
			for( const key of ( dict.keys() ?? [] ) as string[] ) {
				const track = dict.key( key )
				if( !track ) continue
				if( track.playlist() !== playlist ) continue
				if( !track.info() ) continue
				rows.push({ key, order: track.order(), added: track.added() })
			}
			rows.sort( ( a, b ) => a.order !== b.order ? a.order - b.order : b.added - a.added )
			return rows.map( r => r.key )
		}

		shared_playlists(): { id: string, sender: string, count: number }[] {
			const dict = this.tracks()
			const map = new Map< string, number >()
			for( const key of ( dict.keys() ?? [] ) as string[] ) {
				const pl = dict.key( key )?.playlist() ?? ''
				if( !pl.startsWith( 'shared:' ) ) continue
				map.set( pl, ( map.get( pl ) ?? 0 ) + 1 )
			}
			return Array.from( map.entries() ).map( ([ id, count ]) => ({
				id,
				sender: id.slice( 'shared:'.length ),
				count,
			}) )
		}

		min_order(): number {
			let min = Infinity
			const dict = this.tracks()
			for( const key of ( dict.keys() ?? [] ) as string[] ) {
				const track = dict.key( key )
				if( !track ) continue
				min = Math.min( min, track.order() )
			}
			return Number.isFinite( min ) ? min : 1
		}

		max_order( playlist: string ): number {
			let max = -Infinity
			const dict = this.tracks()
			for( const key of ( dict.keys() ?? [] ) as string[] ) {
				const track = dict.key( key )
				if( !track ) continue
				if( track.playlist() !== playlist ) continue
				max = Math.max( max, track.order() )
			}
			return Number.isFinite( max ) ? max : 0
		}

		@ $mol_action
		move_to_bottom( key: string ): void {
			const track = this.track( key )
			if( !track ) return
			track.order_set( this.max_order( track.playlist() ) + 1 )
		}

		@ $mol_action
		save_track( key: string, meta: $bog_music_track_baza_info ): void {
			const track = this.tracks().key( key, 'auto' )!
			if( track.Title()?.val() !== meta.title ) track.Title( 'auto' )!.val( meta.title )
			if( track.Artist()?.val() !== meta.artist ) track.Artist( 'auto' )!.val( meta.artist )
			if( track.Duration()?.val() !== meta.duration ) track.Duration( 'auto' )!.val( meta.duration )
			if( meta.cover && track.Cover()?.val() !== meta.cover ) track.Cover( 'auto' )!.val( meta.cover )
			if( track.Added()?.val() == null ) track.Added( 'auto' )!.val( Date.now() )
			if( track.Order()?.val() == null ) track.Order( 'auto' )!.val( this.min_order() - 1 )
		}

		@ $mol_action
		holder_add( key: string ): void {
			this.track( key )?.holder_add( $bog_music_device.id() )
		}

		@ $mol_action
		holder_cut( key: string ): void {
			this.track( key )?.holder_cut( $bog_music_device.id() )
		}

		async import_audio( key: string, meta: $bog_music_track_baza_info, bytes: Uint8Array, playlist = '' ) {
			$bog_music_log.act(
				`импорт трека ${ meta.artist } — ${ meta.title }${ playlist ? ` в «${ playlist }»` : '' }`,
				this.land_id(),
			)
			await $bog_music_disk.put( key, bytes )
			const self = $mol_wire_async( this )
			await self.save_track( key, meta )
			if( playlist ) await self.move_to_playlist( key, playlist )
			await self.holder_add( key )
			this.lufs_measure( key, bytes )
		}

		async save_local_track( file: File, order?: number ) {
			const { artist, title, order: parsed_order } = $bog_music_account_baza.parse_filename( file.name )
			const key = $bog_music_account_baza.key_make( `${ file.name }|${ file.size }|${ file.lastModified }` )
			$bog_music_log.act( `файл с устройства: ${ file.name }, ${ file.size } байт → ${ artist } — ${ title }`, this.land_id() )
			const bytes = new Uint8Array( await file.arrayBuffer() )
			await this.import_audio( key, { artist, title, duration: 0, cover: '' }, bytes )
			const want = parsed_order ?? order
			if( want != null ) await $mol_wire_async( this ).order_set( key, want )
		}

		@ $mol_action
		order_set( key: string, order: number ) {
			this.track( key )?.order_set( order )
		}

		place( key: string ): $bog_music_account_place {
			if( $bog_music_disk.has( key ) ) return 'disk'
			const track = this.track( key )
			if( !track ) return 'lost'
			const me = $bog_music_device.id()
			if( track.holders().some( id => id !== me ) ) return 'remote'
			if( track.legacy() ) return 'legacy'
			return 'lost'
		}

		holders_other( key: string ): string[] {
			const me = $bog_music_device.id()
			return ( this.track( key )?.holders() ?? [] ).filter( id => id !== me )
		}

		async migrate( key: string ): Promise< boolean > {
			if( await $bog_music_disk.probe( key ) ) return true
			const track = this.track( key )
			if( !track?.legacy() ) return false
			const bytes = await $mol_wire_async( track ).legacy_bytes()
			if( !bytes ) return false
			await $bog_music_disk.put( key, bytes )
			await $mol_wire_async( this ).holder_add( key )
			$bog_music_log.act( `перенесён из Базы на устройство: ${ key }, ${ bytes.length } байт`, this.land_id() )
			return true
		}

		@ $mol_action
		swap_order( key_a: string, key_b: string ): void {
			const ta = this.tracks().key( key_a, 'auto' )
			const tb = this.tracks().key( key_b, 'auto' )
			if( !ta || !tb ) return
			const oa = ta.order()
			const ob = tb.order()
			ta.order_set( ob === oa ? oa + 1 : ob )
			tb.order_set( oa )
		}

		@ $mol_action
		move_to_playlist( key: string, playlist: string ): void {
			const track = this.track( key )
			if( !track ) return
			$bog_music_log.act( `${ key } → плейлист «${ playlist || 'Моя музыка' }»`, this.land_id() )
			track.Playlist( 'auto' )!.val( playlist )
		}

		playlists_dict() {
			return this.Playlists( null )!
		}

		playlists(): { id: string, title: string }[] {
			const dict = this.playlists_dict()
			const rows: { id: string, title: string }[] = []
			for( const id of ( dict.keys() ?? [] ) as string[] ) {
				const title = dict.key( id )?.val()
				if( title == null ) continue
				rows.push({ id, title })
			}
			return rows.sort( ( a, b ) => a.title.localeCompare( b.title, 'ru', { numeric: true } ) )
		}

		playlist_title( id: string ): string {
			return this.playlists_dict().key( id )?.val() ?? ''
		}

		@ $mol_action
		playlist_create( title: string ): string {
			const id = 'list:' + $mol_guid( 8, id => this.playlists_dict().has( id ) )
			$bog_music_log.act( `новый плейлист «${ title }»`, this.land_id() )
			this.playlists_dict().key( id, 'auto' )!.val( title )
			return id
		}

		@ $mol_action
		playlist_rename( id: string, title: string ): void {
			this.playlists_dict().key( id, 'auto' )!.val( title )
		}

		@ $mol_action
		playlist_delete( id: string ): void {
			$bog_music_log.act( `удалён плейлист ${ id }`, this.land_id() )
			for( const key of this.keys_in( id ) ) this.move_to_playlist( key, '' )
			this.Lists( null )!.cut( id )
			this.playlists_dict().cut( id )
		}

		list( id: string, auto?: 'auto' ) {
			return this.Lists( null )!.key( id, auto )
		}

		list_raw( id: string ): string[] {
			return ( this.list( id )?.items() ?? [] ) as string[]
		}

		list_keys( id: string ): string[] {
			const keys: string[] = []
			for( const key of this.list_raw( id ) ) {
				const track = this.track( key )
				if( !track?.info() ) continue
				if( track.playlist() === 'archive' ) continue
				keys.push( key )
			}
			return keys
		}

		list_has( id: string, key: string ): boolean {
			return this.list( id )?.has( key ) ?? false
		}

		@ $mol_action
		list_add( id: string, key: string ): void {
			$bog_music_log.act( `${ key } → в «${ this.playlist_title( id ) }»`, this.land_id() )
			this.list( id, 'auto' )!.add( key )
		}

		@ $mol_action
		list_cut( id: string, key: string ): void {
			$bog_music_log.act( `${ key } ← из «${ this.playlist_title( id ) }»`, this.land_id() )
			this.list( id )?.cut( key )
		}

		@ $mol_action
		list_move( id: string, key: string, to_key: string ): void {
			const raw = this.list_raw( id )
			const from = raw.indexOf( key )
			const to = raw.indexOf( to_key )
			if( from < 0 || to < 0 || from === to ) return
			this.list( id, 'auto' )!.move( from, to > from ? to + 1 : to )
		}

		@ $mol_action
		migrate_lists(): void {
			const dict = this.tracks()
			for( const key of ( dict.keys() ?? [] ) as string[] ) {
				const track = dict.key( key )
				const id = track?.playlist() ?? ''
				if( !id.startsWith( 'list:' ) ) continue
				this.list( id, 'auto' )!.add( key )
				track!.Playlist( 'auto' )!.val( '' )
			}
		}

		async delete_track( key: string ) {
			$bog_music_log.act( `трек вырезан из фонотеки: ${ key }`, this.land_id() )
			await $bog_music_disk.drop( key )
			await $mol_wire_async( this.tracks() ).cut( key )
		}

		async drop_file( key: string ) {
			$bog_music_log.act( `файл удалён с устройства, метаданные оставлены: ${ key }`, this.land_id() )
			await $bog_music_disk.drop( key )
			await $mol_wire_async( this ).holder_cut( key )
		}

		@ $mol_action
		save_lufs( key: string, lufs: number ): void {
			this.track( key )?.lufs( lufs )
		}

		lufs_measure( key: string, buffer: Uint8Array ): void {
			$bog_music_gain.measure_later( buffer, lufs => $mol_wire_async( this ).save_lufs( key, lufs ) )
		}

		last_session(): { key: string, position: number } | null {
			const key = this.Last_track_key()?.val() ?? ''
			if( !key ) return null
			if( !this.track( key ) ) return null
			const position = Number( this.Last_position()?.val() ?? 0 ) || 0
			return { key, position }
		}

		@ $mol_action
		save_last_session( key: string, position: number ): void {
			this.Last_track_key( 'auto' )!.val( key )
			this.Last_position( 'auto' )!.val( Math.max( 0, position || 0 ) )
		}

		eq_gains(): number[] {
			return $bog_music_eq.parse( this.Eq_gains()?.val() ?? '' )
		}

		eq_on(): boolean {
			return this.Eq_on()?.val() ?? false
		}

		@ $mol_action
		save_eq_on( on: boolean ): void {
			this.Eq_on( 'auto' )!.val( on )
		}

		@ $mol_action
		save_eq_gains( gains: readonly number[] ): void {
			this.Eq_gains( 'auto' )!.val( $bog_music_eq.stringify( gains ) )
		}

		devices() {
			return this.Devices( null )!
		}

		static online_span = 90_000

		@ $mol_action
		device_beat(): void {
			const device = this.devices().key( $bog_music_device.id(), 'auto' )!
			const name = $bog_music_device.title()
			if( device.Name()?.val() !== name ) device.Name( 'auto' )!.val( name )
			device.Beat( 'auto' )!.val( Date.now() )
		}

		device_name( id: string ): string {
			return this.devices().key( id )?.name() ?? 'другое устройство'
		}

		device_online( id: string, now = Date.now() ): boolean {
			const beat = this.devices().key( id )?.beat() ?? 0
			return now - beat < $bog_music_account_baza.online_span
		}

		signals() {
			return this.Signals( null )!
		}

		static parse_filename( name: string ): { artist: string, title: string, order: number | null } {
			let base = name.replace( /\.[^.]+$/, '' ).trim()
			let order: number | null = null
			const numbered = base.match( /^(\d{1,4})\s*[-–—]\s*(.+)$/ )
			if( numbered ) {
				order = Number( numbered[ 1 ] )
				base = numbered[ 2 ].trim()
			}
			const m = base.match( /^(.+?)\s*[-–—]\s*(.+)$/ )
			if( m ) return { artist: m[ 1 ].trim(), title: m[ 2 ].trim(), order }
			return { artist: '', title: base, order }
		}

		static hash_str( s: string ): number {
			let h = 2166136261
			for( let i = 0; i < s.length; i++ ) {
				h ^= s.charCodeAt( i )
				h = Math.imul( h, 16777619 )
			}
			return h >>> 0
		}

	}

}
