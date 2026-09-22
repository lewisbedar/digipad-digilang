<template>
	<div id="conteneur-message" class="conteneur-modale">
		<div id="message" class="modale" role="dialog" aria-modal="true">
			<div class="conteneur">
				<div class="contenu">
					<div class="message" v-html="message" />
					<div class="actions">
						<button type="button" class="bouton" @click="fermer">{{ $t('fermer') }}</button>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script>
export default {
	name: 'DigipadMessage',
	props: {
		message: String
	},
	mounted () {
		if (this.message !== '') {
			this.$emit('elementPrecedent', document.activeElement || document.body)
			this.$nextTick(() => {
				document.querySelector('#message .bouton')?.focus()
			})
		}
	},
	methods: {
		fermer () {
			this.$emit('fermer')
		}
	}
}
</script>

<style>
#conteneur-message .modale .conteneur {
	height: 100%;
	padding: 30px 25px;
	text-align: center;
}

#conteneur-message .modale {
	max-width: 500px;
}

#conteneur-message .message {
	font-size: 18px;
	line-height: 1.5;
}

#conteneur-message .message p:last-child {
	margin-bottom: 0;
}

#conteneur-message .bouton {
	margin-top: 20px;
}

#conteneur-message .modale .actions {
	font-size: 0;
}
</style>
