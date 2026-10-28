namespace $ {

	export class $bog_music_land extends $mws_baza_land {

		static release_all() {
			for( const land of this.$.$giper_baza_glob.yard().lands_alive() ) {
				if( !( land instanceof $bog_music_land ) ) continue
				try {
					land.sands_release()
				} catch( error ) {
					if( $mol_promise_like( error ) ) $mol_fail_hidden( error )
					$mol_fail_log( error )
				}
			}
		}

		sand_load( sand: $giper_baza_unit_sand ) {}

		diff_units( skip_faces?: $giper_baza_face_map ) {
			const units = super.diff_units( skip_faces )
			for( const unit of units ) {
				if( !( unit instanceof $giper_baza_unit_sand ) ) continue
				if( !unit.big() || unit._ball ) continue
				unit._ball = $mol_wire_sync( this.mine() ).ball_load( unit )
			}
			return units
		}

		sands_release() {
			this.units_saving()
			const mine = this.mine()
			for( const peers of this._sand.values() ) {
				for( const sands of peers.values() ) {
					for( const sand of sands.values() ) {
						if( !sand.big() || !sand._ball ) continue
						if( !mine.units_persisted.has( sand ) ) continue
						this.sand_unload( sand )
					}
				}
			}
		}

	}

}
