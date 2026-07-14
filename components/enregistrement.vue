<template>
	<div class="enregistrer audio">
		<template v-if="!parent.enregistrement && !chargement">
			<button type="button" id="enregistrer" class="bouton" :disabled="parent.disabledModale" @click="enregistrerAudio"><i class="material-icons" aria-hidden="true">fiber_manual_record</i><span>{{ $t('enregistrerAudio') }}</span></button>
		</template>
		<div id="enregistrement" v-else-if="parent.enregistrement && !chargement">
			<canvas id="visualisation" width="360" height="60" />
			<div class="enregistrement">
				<button type="button" class="bouton" :class="{'stopper': !pause}" :disabled="parent.disabledModale" :title="$t('stopper')" :aria-label="$t('stopper')" @click="arreterEnregistrementAudio">
					<i class="material-icons" aria-hidden="true">stop</i>
				</button>
				<button type="button" class="bouton" :disabled="parent.disabledModale" :title="$t('pause')" :aria-label="$t('pause')" @click="mettreEnPauseEnregistrementAudio">
					<i class="material-icons" aria-hidden="true" v-if="!pause">pause</i>
					<i class="material-icons" aria-hidden="true" v-else>play_arrow</i>
				</button>
				<span class="duree">{{ dureeEnregistrement }}</span>
			</div>
		</div>
		<div class="conteneur-chargement" v-else>
			<div class="chargement" />
		</div>
	</div>
</template>

<script>
export default {
	name: 'DigipadEnregistrement',
	inject: ['parent'],
	data () {
		return {
			chargement: false,
			enregistrementSupporte: true,
			entreeAudio: false,
			mediaRecorder: null,
			flux: null,
			pause: false,
			delta: '',
			contexte: null,
			sourceAudio: null,
			analyseurAudio: null,
			animationFrameId: null,
			intervalle: null,
			dureeEnregistrement: '00:00',
			safari: false
		}
	},
	async mounted () {
		if (!navigator.mediaDevices || !navigator.mediaDevices?.enumerateDevices) {
			this.enregistrementSupporte = false
		} else {
			navigator.mediaDevices.enumerateDevices().then((devices) => {
				for (const device of devices) {
					if (device.kind === 'audioinput') {
						this.entreeAudio = true
						break
					}
				}
				if (this.entreeAudio === true) {
					if (!navigator.mediaDevices?.getUserMedia) {
						this.enregistrementSupporte = false
					}
				}
			}).catch(() => {
				this.enregistrementSupporte = false
			})
		}
		
		const ua = window.navigator.userAgent
		const apple = ua.match(/Macintosh/i) || ua.match(/iPad/i) || ua.match(/iPhone/i)
		const webkit = ua.match(/WebKit/i)
		this.safari = apple && webkit && !ua.match(/CriOS/i) && !ua.match(/EdgiOS/i) && !ua.match(/Chrome/i) && !ua.match(/Edg/i)
	},
	beforeUnmount () {
		if (this.flux) {
			this.flux?.getTracks?.()?.forEach(t => {
				try {
					t.stop()
				} catch {}
			})
			this.flux = null
		}
		if (this.sourceAudio) {
			this.sourceAudio.disconnect()
			this.sourceAudio = null
		}
		if (this.analyseurAudio) {
			this.analyseurAudio.disconnect()
			this.analyseurAudio = null
		}
		if (this.contexte) {
			this.contexte.close()
			this.contexte = null
		}
		if (this.intervalle) {
			clearInterval(this.intervalle)
			this.intervalle = null
		}
		if (this.animationFrameId) {
			cancelAnimationFrame(this.animationFrameId)
			this.animationFrameId = null
		}
		if (this.mediaRecorder) {
			if (this.safari) {
				this.mediaRecorder.getInternalRecorder().clearRecordedData()
			}
			this.mediaRecorder.destroy()
			this.mediaRecorder = null
		}
	},
	methods: {
		enregistrerAudio () {
			if (!this.enregistrementSupporte) {
				this.parent.notification = this.$t('enregistrementNonSupporte')
			} else if (!this.entreeAudio) {
				this.parent.notification = this.$t('aucuneEntreeAudio')
			} else {
				navigator.mediaDevices.getUserMedia({ audio: true }).then((flux) => {
					let options = { type: 'audio', mimeType: 'audio/wav', sampleRate: 44100, desiredSampRate: 44100 }
					if (this.safari) {
						options = { type: 'audio', recorderType: StereoAudioRecorder, sampleRate: 44100, desiredSampRate: 44100, bufferSize: 4096, numberOfAudioChannels: 2 }
					}
					this.flux = flux
					this.mediaRecorder = RecordRTC(this.flux, options)
					this.mediaRecorder.startRecording()
					this.$nextTick(() => {
						this.visualiser(flux)
					})
					this.parent.enregistrement = true
					const temps = Date.now()
					this.intervalle = setInterval(() => {
						this.delta = Date.now() - temps
						let secondes = Math.floor((this.delta / 1000) % 60)
						let minutes = Math.floor(this.delta / 1000 / 60)
						if (secondes < 10) {
							secondes = '0' + secondes
						}
						if (minutes < 10) {
							minutes = '0' + minutes
						}
						this.dureeEnregistrement = minutes + ':' + secondes
						if (this.dureeEnregistrement === '09:00') {
							this.arreterEnregistrementAudio()
						}
					}, 100)
				}).catch(() => {
					this.parent.enregistrement = false
					this.mediaRecorder = null
					this.flux = null
					if (this.sourceAudio) {
						this.sourceAudio.disconnect()
						this.sourceAudio = null
					}
					if (this.analyseurAudio) {
						this.analyseurAudio.disconnect()
						this.analyseurAudio = null
					}
					if (this.contexte) {
						this.contexte.close()
						this.contexte = null
					}
					if (this.animationFrameId) {
						cancelAnimationFrame(this.animationFrameId)
						this.animationFrameId = null
					}
					this.parent.notification = this.$t('erreurMicro')
				})
			}
		},
		mettreEnPauseEnregistrementAudio () {
			if (this.pause === false) {
				if (this.intervalle) {
					clearInterval(this.intervalle)
					this.intervalle = null
				}
				this.pause = true
				this.mediaRecorder.pauseRecording()
			} else {
				this.pause = false
				this.mediaRecorder.resumeRecording()
				let temps = Date.now()
				temps = temps - this.delta
				this.intervalle = setInterval(() => {
					this.delta = Date.now() - temps
					let secondes = Math.floor((this.delta / 1000) % 60)
					let minutes = Math.floor(this.delta / 1000 / 60)
					if (secondes < 10) {
						secondes = '0' + secondes
					}
					if (minutes < 10) {
						minutes = '0' + minutes
					}
					this.dureeEnregistrement = minutes + ':' + secondes
				}, 100)
			}
		},
		arreterEnregistrementAudio () {
			if (this.safari) {
				this.chargement = true
			}
			this.mediaRecorder.stopRecording(() => {
				const blob = this.mediaRecorder.getBlob()
				this.delta = ''
				this.pause = false
				this.dureeEnregistrement = '00:00'
				if (this.flux) {
					this.flux?.getTracks?.()?.forEach(t => {
						try {
							t.stop()
						} catch {}
					})
					this.flux = null
				}
				if (this.sourceAudio) {
					this.sourceAudio.disconnect()
					this.sourceAudio = null
				}
				if (this.analyseurAudio) {
					this.analyseurAudio.disconnect()
					this.analyseurAudio = null
				}
				if (this.contexte) {
					this.contexte.close()
					this.contexte = null
				}
				if (this.intervalle) {
					clearInterval(this.intervalle)
					this.intervalle = null
				}
				if (this.animationFrameId) {
					cancelAnimationFrame(this.animationFrameId)
					this.animationFrameId = null
				}
				if (this.mediaRecorder) {
					if (this.safari) {
						this.mediaRecorder.getInternalRecorder().clearRecordedData()
					}
					this.mediaRecorder.destroy()
					this.mediaRecorder = null
				}
				this.parent.blob = blob
				this.parent.media = URL.createObjectURL(blob)
				this.parent.type = 'enregistrement'
				const donnees = {}
				donnees.type = 'enregistrement'
				const vignette = this.parent.definirVignette(donnees)
				this.parent.vignette = vignette
				this.parent.vignetteDefaut = vignette
				this.chargement = false
				this.parent.enregistrement = false
			})
		},
		visualiser (flux) {
			if (this.contexte === null) {
				this.contexte = new AudioContext()
			}
			const source = this.contexte.createMediaStreamSource(flux)
			const analyser = this.contexte.createAnalyser()
			this.sourceAudio = source
			this.analyseurAudio = analyser
			analyser.fftSize = 2048
			const bufferLength = analyser.frequencyBinCount
			const dataArray = new Uint8Array(bufferLength)
			source.connect(analyser)
			const draw = () => {
				if (document.querySelector('#visualisation')) {
					const canvas = document.querySelector('#visualisation')
					const canvasCtx = canvas.getContext('2d')
					const largeur = document.querySelector('#enregistrement').offsetWidth
					const hauteur = canvas.height
					canvas.width = largeur
					this.animationFrameId = requestAnimationFrame(draw)
					analyser.getByteTimeDomainData(dataArray)
					canvasCtx.fillStyle = '#eeeeee'
					canvasCtx.fillRect(0, 0, largeur, hauteur)
					canvasCtx.lineWidth = 2
					canvasCtx.strokeStyle = '#000000'
					canvasCtx.beginPath()
					const sliceWidth = largeur * 1.0 / bufferLength
					let x = 0
					for (let i = 0; i < bufferLength; i++) {
						const v = dataArray[i] / 128.0
						const y = v * hauteur / 2
						if (i === 0) {
							canvasCtx.moveTo(x, y)
						} else {
							canvasCtx.lineTo(x, y)
						}
						x += sliceWidth
					}
					canvasCtx.lineTo(canvas.width, canvas.height / 2)
					canvasCtx.stroke()
				} else {
					this.animationFrameId = null
				}
			}
			this.$nextTick(() => {
				draw()
			})
		}
	}
}
</script>

<style scoped>
.enregistrer.audio {
	font-size: 0;
	text-align: center;
}

.enregistrer.audio .bouton {
	margin-bottom: 15px;
}

.enregistrer.audio .conteneur-chargement {
	font-size: 0;
	line-height: 1;
	text-align: center;
}

.enregistrer.audio .chargement {
	display: inline-block;
	border: 7px solid #ddd;
	border-top: 7px solid #00ced1;
	border-radius: 50%;
	width: 50px;
	height: 50px;
	animation: rotation 0.7s linear infinite;
}

#enregistrer i {
	font-size: 24px;
	margin-right: 1rem;
	color: #ff1f1f;
}

#enregistrement .enregistrement {
	display: flex;
	justify-content: center;
	align-items: center;
}

#enregistrement .enregistrement .duree {
	font-family: monospace;
	font-size: 3rem;
	font-weight: 500;
	margin-left: 2.5rem;
}

#enregistrement .enregistrement .bouton {
	background-color: #fff;
	border-color: #001d1d;
	border-width: 2px;
	border-radius: 0;
	line-height: 1;
	height: auto;
	padding: 1rem;
	margin-bottom: 0;
}

#enregistrement .enregistrement .bouton:hover {
	color: #001d1d;
	background-color: #eee;
}

#enregistrement .enregistrement .bouton:first-child {
	margin-right: 2.5rem;
}

#enregistrement .enregistrement .bouton i {
	font-size: 48px;
	line-height: 1;
	margin: 0;
}

#enregistrement .enregistrement .bouton.stopper {
	color: #001d1d;
    animation: couleur ease-in 2s infinite;
}

#visualisation {
	margin-bottom: 15px;
}

@keyframes couleur {
    0% {
		background: #fff;
	}
    50% {
		background: #ff1f1f;
	}
    100% {
		background: #fff;
	}
}
</style>
