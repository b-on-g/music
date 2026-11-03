namespace $ {

	export class $bog_music_share_baza extends $giper_baza_dict.with({
		Kind: $giper_baza_atom.of( $mol_schema_string ),
		Sender: $giper_baza_atom.of( Uint8Array ),
		Count: $giper_baza_atom.of( $mol_schema_float ),
		Offer: $giper_baza_atom.of( Uint8Array ),
		Answer: $giper_baza_atom.of( Uint8Array ),
		Done: $giper_baza_atom.of( $mol_schema_boolean ),
	}) {

		static kind = 'p2p1'

	}

}
