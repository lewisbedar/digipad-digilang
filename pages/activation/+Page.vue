<template>
	<div id="page">
		<div id="activation">
			<span id="logo" />
			<h3>{{ $t('compteActive') }}</h3>
			<h4><a :href="hote">{{ $t('retourAccueil') }}</a></h4>
		</div>

		<ChargementPage :chargement="chargementPage" />
	</div>
</template>

<script>
import ChargementPage from '#root/components/chargement-page.vue'

export default {
	name: 'DigipadActivation',
	components: {
		ChargementPage
	},
	data () {
		return {
			chargementPage: true,
			hote: this.$pageContext.pageProps.hote,
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
		this.chargementPage = false
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

#activation {
	padding: 2rem;
	margin-bottom: 7rem;
	text-align: center;
}

#logo {
	display: inline-block;
	width: 10rem;
	height: 10rem;
	background: #00ced1;
	border-radius: 50%;
	margin-bottom: 3rem;
}

#page h3 {
	font-size: 2.7rem;
	text-align: center;
	margin-bottom: 2rem;
}

#page h4 {
	font-size: 2rem;
}

#page h4 a {
	text-decoration: underline;
}

@media screen and (max-width: 599px) {
	#page h3 {
		font-size: 2.3rem;
	}

	#page h4 {
		font-size: 1.8rem;
	}
}
</style>
