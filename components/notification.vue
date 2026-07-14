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
			if (notification !== this.$t('rechargerPage')) {
				this.timeoutNotification = setTimeout(() => {
					this.timeoutNotification = null
					element?.remove()
					this.$emit('fermer')
				}, 2500)
			} else {
				element.style.cursor = 'pointer'
				this.elementNotification = element
				this.evenementNotification = () => {
					element?.remove()
					this.$emit('fermer')
				}
				element.addEventListener('click', this.evenementNotification)
			}
		}
	}
}
</script>
