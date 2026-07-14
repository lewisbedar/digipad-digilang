<template>
	<div id="emojis" :class="definirClasses()">
		<h5>{{ $t('emoticones') }}</h5>
		<div class="categorie">
			<button type="button" :disabled="disabled" v-for="(emoticone, indexEmoticone) in emoticones" @click="insererEmoji(emoticone)" :key="'emoticone_' + indexEmoticone">{{ emoticone }}</button>
		</div>
		<h5>{{ $t('gestesEtCorps') }}</h5>
		<div class="categorie">
			<button type="button" :disabled="disabled" v-for="(geste, indexGeste) in gestes" @click="insererEmoji(geste)" :key="'geste_' + indexGeste">{{ geste }}</button>
		</div>
		<h5>{{ $t('nature') }}</h5>
		<div class="categorie">
			<button type="button" :disabled="disabled" v-for="(nature, indexNature) in natures" @click="insererEmoji(nature)" :key="'nature_' + indexNature">{{ nature }}</button>
		</div>
		<h5>{{ $t('aliments') }}</h5>
		<div class="categorie">
			<button type="button" :disabled="disabled" v-for="(aliment, indexAliment) in aliments" @click="insererEmoji(aliment)" :key="'aliment_' + indexAliment">{{ aliment }}</button>
		</div>
		<h5>{{ $t('objets') }}</h5>
		<div class="categorie">
			<button type="button" :disabled="disabled" v-for="(objet, indexObjet) in objets" @click="insererEmoji(objet)" :key="'objet_' + indexObjet">{{ objet }}</button>
		</div>
		<h5>{{ $t('lieux') }}</h5>
		<div class="categorie">
			<button type="button" :disabled="disabled" v-for="(lieu, indexLieu) in lieux" @click="insererEmoji(lieu)" :key="'lieu_' + indexLieu">{{ lieu }}</button>
		</div>
	</div>
</template>

<script>
export default {
	name: 'DigipadEmojis',
	props: {
		type: String,
		diaporama: Boolean,
		disabled: Boolean
	},
	data () {
		return {
			emoticones: ['😀','😃','😄','😁','😆','😅','😂','🤣','🥲','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','🤡','👻','💀','👽','👾','🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','😾', '💯', '✔️', '☀️', '✨', '🎉'],
			gestes: ['👋','🤚','✋','👌','🤌','🤏','🤞','🤟','🤘','🤙','👈','👉','👆','👇','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💅','🤳','💪','🦾','🦵','🦿','🦶','👣','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀','👅','👄','💋','🩸'],
			natures: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦟','🦗','🕷','🕸','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕','🦺','🐈','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿','🦔','🐾','🐉','🐲','🌵','🎄','🌲','🌳','🌴','🪵','🌱','🌿','🍀','🎍','🪴','🎋','🍃','🍂','🍁','🍄','🐚','🪨','🌾','💐','🌷','🌹','🥀','🌺','🌸','🌼','🌻','🌞','🌝','🌛','🌜','🌚','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌙','🌎','🌍','🌏','🪐','💫','⭐','🌟','✨','💥','🔥','🌈','⛅','⛄','💨','💧','💦','🌊'],
			aliments: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','🫖','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🧊','🥄','🍴','🥣','🥡','🥢','🧂'],
			objets: ['🎍','💝','🎎','🎒','🎓','🎏','🎆','🎇','🎐','🎑','🎃','👻','🎅','🎄','🎁','🎋','🎉','🎊','🎈','🎌','🔮','🎥','📷','📹','📼','💿','📀','💽','💾','💻','📱','📞','📟','📠','📡','📺','📻','🔊','🔔','📢','📣','⏳','⌛','⏰','⌚','🔓','🔒','🔏','🔐','🔑','🔎','💡','🔦','🔌','🔋','🔍','🛀','🚽','🔧','🔩','🔨','🚪','🚬','💣','🔫','🔪','💊','💉','💰','💴','💵','💳','💸','📲','📧','📥','📤','📩','📨','📫','📪','📮','📦','📝','📄','📃','📑','📊','📈','📉','📜','📋','📅','📆','📇','📁','📂','📌','📎','📏','📐','📕','📗','📘','📙','📓','📔','📒','📚','📖','🔖','📛','📰','🎨','🎬','🎤','🎧','🎼','🎵','🎶','🎹','🎻','🎺','🎷','🎸','👾','🎮','🃏','🎴','🀄','🎲','🎯','🏈','🏀','⚽','⚾','🎾','🎱','🎳','⛳','🏁','🏆','🎿','🏂','🏊','🏄','🎣','🍵','🍶', '👑'],
			lieux: ['🏠','🏡','🏫','🏢','🏣','🏥','🏦','🏪','🏩','🏨','💒','⛪','🏬','🌇','🌆','🏯','🏰','⛺','🏭','🗼','🗾','🗻','🌄','🌅','🌃','🗽','🌉','🎠','🎡','⛲','🎢','🚢','⛵','🚤','🚀','💺','🚉','🚄','🚅','🚇','🚃','🚌','🚙','🚗','🚕','🚚','🚨','🚓','🚒','🚑','🚲','💈','🚏','🎫','🚥','🚧','🔰','⛽','🏮','🎰','🗿','🎪','🎭','📍','🚩']
		}
	},
	methods: {
		definirClasses () {
			if (this.diaporama === true) {
				return this.type + ' diaporama'
			} else {
				return this.type
			}
		},
		insererEmoji (emoji) {
			this.$emit('emoji', emoji)
		}
	}
}
</script>

<style scoped>
#emojis {
	position: absolute;
	height: 17.2rem;
	width: 30rem;
	padding: 1rem;
	border: 1px solid #ddd;
	background: #fff;
	box-shadow: 0px 0px 8px 3px rgba(0, 0, 0, 0.2);
	overflow: auto;
	-webkit-overflow-scrolling: touch;
	z-index: 10;
	line-height: 1.25;
}

#emojis.commentaire {
	bottom: 12rem;
	left: 1rem;
}

#emojis.commentaire.diaporama {
	left: -1px;
}

#emojis.commentaire-modifie {
	top: 6rem;
	left: -1px;
}

#emojis.commentaire-modifie.diaporama {
	bottom: 12rem;
	left: -1px;
}

#emojis h5 {
	margin: 0 0 2px 0;
	text-transform: uppercase;
	font-size: 1rem;
	cursor: default;
}

.categorie {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	width: 100%;
	margin-bottom: 1rem;
}

.categorie:last-of-type {
	margin-bottom: 0;
}

.categorie:after {
	content: '';
	flex: auto;
}

.categorie button {
	font-size: 2rem;
	padding: 2px;
	cursor: pointer;
	border-radius: 0.5rem;
}

.categorie button:hover {
	background: #ececec;
	cursor: pointer;
}
</style>
