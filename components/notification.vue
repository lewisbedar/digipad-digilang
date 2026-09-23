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
			evenementNotificationClavier: null,
			timeoutNotification: null
		}
	},
	beforeUnmount () {
		if (this.timeoutNotification) {
			clearTimeout(this.timeoutNotification)
		}
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
			const element = document.createElement('div')
			element.textContent = notification
			element.classList.add('notification')
			document.querySelector('#notification')?.appendChild(element)
			const notificationsPersistantes = [this.$t('rechargerPage'), this.$t('sessionExpiree')]
			if (!notificationsPersistantes.includes(notification)) {
				this.timeoutNotification = setTimeout(() => {
					this.timeoutNotification = null
					element?.remove()
					this.$emit('fermer')
				}, 2500)
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
