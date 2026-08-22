const audio = document.getElementById( 'audio' )

let current_audio = null
let last_blob_url = ''

// Громкость = крутилка пользователя × множитель выравнивания трека. Пока
// множитель не больше единицы, хватает audio.volume; усиливать им нельзя (он
// зажат единицей), поэтому под усиление поднимаем цепочку audio → gain →
// limiter. Поднимаем только когда усиление реально понадобилось и контекст
// уже проснулся: заведённый в спящий граф элемент замолчал бы целиком.
let volume = 0.7
let gain = 1
let ctx = null
let gain_node = null
let chain_ready = false
let chain_dead = false

function apply_volume() {
	if ( chain_ready ) {
		audio.volume = 1
		gain_node.gain.value = volume * gain
		return
	}
	audio.volume = Math.max( 0, Math.min( 1, volume * gain ) )
	if ( volume * gain > 1 ) ensure_chain()
}

function ensure_chain() {
	if ( chain_ready || chain_dead ) return
	try {
		if ( !ctx ) ctx = new AudioContext()
		if ( ctx.state !== 'running' ) {
			ctx.resume().then( ensure_chain ).catch( () => {} )
			return
		}
		const src = ctx.createMediaElementSource( audio )
		gain_node = ctx.createGain()
		// Страховка от клиппинга: у поднятой тихой записи пики вылезают за 0 dBFS.
		const limiter = ctx.createDynamicsCompressor()
		limiter.threshold.value = -1
		limiter.knee.value = 0
		limiter.ratio.value = 20
		limiter.attack.value = 0.003
		limiter.release.value = 0.25
		src.connect( gain_node )
		gain_node.connect( limiter )
		limiter.connect( ctx.destination )
		chain_ready = true
		apply_volume()
	} catch ( e ) {
		chain_dead = true
		console.warn( '[offscreen] gain chain failed:', e )
	}
}

apply_volume()

// chrome.runtime.sendMessage сериализует payload через JSON — ArrayBuffer/Blob
// приходят как пустой `{}`. Поэтому play_track (с blob'ом) ходит через
// BroadcastChannel: structured clone сохраняет Blob/ArrayBuffer как есть.
const channel = new BroadcastChannel( 'bog_music_player' )

function broadcast( type, payload ) {
	chrome.runtime.sendMessage( { target: 'popup', type, ...payload } ).catch( () => {} )
}

audio.addEventListener( 'play', () => {
	// Контекст мог заснуть, пока вкладка была закрыта — иначе играем в тишину.
	if ( ctx && ctx.state !== 'running' ) ctx.resume().catch( () => {} )
	broadcast( 'state', { playing: true } )
} )
audio.addEventListener( 'pause', () => broadcast( 'state', { playing: false } ) )
audio.addEventListener( 'timeupdate', () => broadcast( 'state', { current_time: audio.currentTime } ) )
audio.addEventListener( 'loadedmetadata', () => broadcast( 'state', { duration: audio.duration } ) )
audio.addEventListener( 'ended', () => broadcast( 'ended', { audio: current_audio } ) )
audio.addEventListener( 'error', () => {
	broadcast( 'error', {
		code: audio.error?.code,
		message: audio.error?.message || 'audio error',
	} )
} )

function play_track_blob( meta, blob, opts ) {
	const start_at = Number( opts?.start_at ) || 0
	const autoplay = opts?.autoplay !== false
	current_audio = meta
	if ( last_blob_url ) {
		URL.revokeObjectURL( last_blob_url )
		last_blob_url = ''
	}
	if ( !blob || !( blob instanceof Blob ) || blob.size === 0 ) {
		broadcast( 'error', { message: 'no source' } )
		return
	}
	last_blob_url = URL.createObjectURL( blob )
	audio.src = last_blob_url
	if ( start_at > 0 ) {
		const seek = () => {
			try { audio.currentTime = start_at } catch {}
			audio.removeEventListener( 'loadedmetadata', seek )
		}
		audio.addEventListener( 'loadedmetadata', seek )
	}
	broadcast( 'state', { current_audio: meta, current_time: start_at, duration: 0, playing: autoplay } )
	if ( autoplay ) {
		audio.play().catch( e => broadcast( 'error', { message: String( e ) } ) )
	}
}

channel.addEventListener( 'message', ( e ) => {
	const msg = e.data
	if ( msg?.target !== 'offscreen' ) return
	if ( msg.type === 'play_track' ) {
		play_track_blob( msg.audio, msg.blob, { start_at: msg.start_at, autoplay: msg.autoplay } )
	}
} )

chrome.runtime.onMessage.addListener( ( msg, _sender, reply ) => {
	if ( msg?.target !== 'offscreen' ) return
	switch ( msg.type ) {
		case 'pause':
			audio.pause()
			reply( { ok: true } )
			return true
		case 'resume':
			audio.play().catch( () => {} )
			reply( { ok: true } )
			return true
		case 'seek':
			if ( typeof msg.time === 'number' ) audio.currentTime = msg.time
			reply( { ok: true } )
			return true
		case 'volume':
			if ( typeof msg.value === 'number' ) volume = msg.value
			if ( typeof msg.gain === 'number' ) gain = msg.gain
			apply_volume()
			reply( { ok: true } )
			return true
		case 'get_state':
			reply( {
				playing: !audio.paused,
				current_time: audio.currentTime || 0,
				duration: isFinite( audio.duration ) ? audio.duration : 0,
				current_audio,
			} )
			return true
	}
} )
