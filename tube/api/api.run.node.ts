namespace $ {

	setTimeout(() => {
		const server = new $bog_music_tube_api()
		server.http()
		console.log('[tube] up on port', server.port())
	})

}
