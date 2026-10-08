<template>
	<div id="notification" aria-live="polite" />
</template>

<script>
export default {
	name: 'DigipadNotification',
	props: {
		notification: String
	},
	data () {
		return {
			elementNotification: null,
			evenementNotification: null,
			evenementNotificationClavier: null
		}
	},
	created () {
		this.chronos = new Map()
	},
	beforeUnmount () {
		this.chronos.forEach((chrono) => clearTimeout(chrono))
		this.chronos.clear()
		if (this.elementNotification && this.evenementNotification) {
			this.elementNotification.removeEventListener('click', this.evenementNotification)
		}
		if (this.elementNotification && this.evenementNotificationClavier) {
			this.elementNotification.removeEventListener('keydown', this.evenementNotificationClavier)
		}
		const container = document.querySelector('#notification')
		if (container) container.innerHTML = ''
	},
	watch: {
		notification (notification) {
			if (notification === '') return
			const conteneur = document.querySelector('#notification')
			const notificationsPersistantes = [this.$t('rechargerPage'), this.$t('sessionExpiree')]
			const notificationPersistante = notificationsPersistantes.includes(notification)
			if (!notificationPersistante) {
				conteneur?.querySelectorAll('.notification').forEach((ancienne) => {
					if (ancienne.textContent === notification && this.chronos.has(ancienne)) {
						clearTimeout(this.chronos.get(ancienne))
						this.chronos.delete(ancienne)
						ancienne.remove()
					}
				})
			}
			const element = document.createElement('div')
			element.textContent = notification
			element.classList.add('notification')
			conteneur?.appendChild(element)
			if (!notificationPersistante) {
				const demarrer = () => {
					clearTimeout(this.chronos.get(element))
					this.chronos.set(element, setTimeout(() => {
						this.chronos.delete(element)
						element.remove()
					}, 5000))
				}
				element.addEventListener('pointerenter', (event) => {
					if (event.pointerType === 'mouse') clearTimeout(this.chronos.get(element))
				})
				element.addEventListener('pointerleave', (event) => {
					if (event.pointerType === 'mouse') demarrer()
				})
				demarrer()
				this.$emit('fermer')
			} else {
				element.style.cursor = 'pointer'
				element.setAttribute('role', 'button')
				element.tabIndex = 0
				this.elementNotification = element
				this.evenementNotification = () => {
					element?.remove()
					this.$emit('fermer')
					window.location.reload()
				}
				this.evenementNotificationClavier = (event) => {
					if (event.key !== 'Enter' && event.key !== ' ') return
					event.preventDefault()
					this.evenementNotification()
				}
				element.addEventListener('click', this.evenementNotification)
				element.addEventListener('keydown', this.evenementNotificationClavier)
			}
		}
	}
}
</script>
