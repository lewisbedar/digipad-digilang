<template>
	<div id="page">
		<div id="erreur">
			<h1>{{ $t('erreur') }}</h1>
			<h3>{{ $t('erreurChargementPage') }}</h3>
			<a href="/">{{ $t('retourAccueil') }}</a>
		</div>

		<ChargementPage v-if="chargementPage" />
	</div>
</template>

<script>
import ChargementPage from '#root/components/chargement-page.vue'

export default {
	name: 'Erreur',
	components: {
		ChargementPage
	},
	data () {
		return {
			chargementPage: true,
			langues: this.$pageContext.pageProps.langues,
			langue: this.$pageContext.pageProps.langue
		}
	},
	created () {
		const params = this.$pageContext.pageProps.params
		const langueNav = navigator.language.substring(0, 2)
		const langueParam = params.lang
		if (langueParam && langueParam !== '' && this.langues.includes(langueParam) === true) {
			this.langue = langueParam
			localStorage.setItem('digipad_lang', langueParam)
		} else if (!langueParam && langueNav !== '' && this.langues.includes(langueNav) === true) {
			this.langue = langueNav
		} 
		if (localStorage.getItem('digipad_lang')) {
			this.langue = localStorage.getItem('digipad_lang')
		}
		this.$i18n.locale = this.langue
		if (this.langue !== this.$pageContext.pageProps.langue) {
			this.$socket.emit('modifierlangue', this.langue)
		}
	},
	mounted () {
		document.getElementsByTagName('html')[0].setAttribute('lang', this.langue)

		setTimeout(function () {
			this.chargementPage = false
		}.bind(this), 300)
	}
}
</script>

<style scoped>
#page {
	display: flex;
	justify-content: center;
	align-items: center;
	width: 100%;
	height: 100%;
	overflow: auto;
}

#erreur {
	padding: 2rem;
	margin-bottom: 7rem;
}

#page h1 {
	font-size: 4.5rem;
	text-transform: uppercase;
	text-align: center;
	margin-bottom: 3rem;
}

#page h3 {
	font-size: 2.7rem;
	text-align: center;
	margin-bottom: 3rem;
}

#page a {
	display: block;
	text-decoration: underline;
	text-align: center;
}

@media screen and (max-width: 599px) {
	#page h1 {
		font-size: 3.2rem;
	}

	#page h3 {
		font-size: 2rem;
	}
}
</style>
