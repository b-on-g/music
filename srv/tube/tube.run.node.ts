namespace $ {

	setTimeout(() => {
		const server = new $bog_music_srv_tube()
		server.http()
		console.log('[tube] up on port', server.port())
	})

}
