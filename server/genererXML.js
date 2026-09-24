import 'dotenv/config'
import { convert } from 'html-to-text'
import t from './lang.js'

function echapperXML(str) {
	if (typeof str !== 'string') {
		str = String(str || '')
	}
	return str
		.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
		.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g, '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;')
}

function verifierURL (s, protocoles) {
	try {
		const url = new URL(s)
		return protocoles ? url.protocol ? protocoles.map(x => `${x.toLowerCase()}:`).includes(url.protocol) : false : true
	} catch (err) {
		return false
	}
}

function genererXML (hote, titre, lien, blocs, admin, langue) {
	let rss = '<?xml version="1.0" encoding="UTF-8"?>\n'
	rss += '<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">\n'
	rss += '  <channel>\n'
	rss += '    <title>' + echapperXML(titre) + '</title>\n'
	rss += '    <link>' + echapperXML(lien)  + '</link>\n'
	rss += '    <description>' + t[langue].fluxRSS + ' "' + echapperXML(titre) + '"</description>\n'
	rss += '    <language>' + langue + '</language>\n'
	// Ajouter les blocs
	for (let i = 0; i < blocs.length; i++) {
		if (!blocs[i] || typeof blocs[i] !== 'object') {
			continue
		}
		if (!admin && blocs[i].visibilite !== 'visible') {
			continue
		}
		try {
			rss += '    <item>\n'
			let titre = blocs[i].titre.trim()
			if (titre === '') {
				titre = t[langue].capsuleSansTitre
			}
			if (blocs[i].nom !== '') {
				rss += '      <title>' + echapperXML(titre) + ' (' + t[langue].par + ' ' + echapperXML(blocs[i].nom) + ')</title>\n'
			} else {
				rss += '      <title>' + echapperXML(titre) + '</title>\n'
			}
			rss += '      <link>' + echapperXML(lien) + '?caps=' + blocs[i].bloc.replace('bloc-id-', '') + '</link>\n'
			if (blocs[i].texte !== '') {
				const texte = convert(blocs[i].texte, { wordwrap: 100 })
				rss += '      <description>' + echapperXML(texte) + '</description>\n'
			}
			const vignette = typeof blocs[i].vignette === 'string' ? blocs[i].vignette : ''
			if (blocs[i].type === 'image' || blocs[i].type === 'lien-image' || vignette !== '') {
				let image = ''
				if (blocs[i].type === 'image') {
					image = blocs[i].mediaUrl || ''
				} else if (blocs[i].type === 'lien-image') {
					image = blocs[i].media || ''
				} else if (verifierURL(vignette, ['https', 'http'])) {
					image = vignette
				} else if (vignette.substring(0, 5) === '/img/') {
					image = hote + vignette
				} else {
					image = blocs[i].vignetteUrl || ''
				}
				if (image !== '') {
					if (!verifierURL(image, ['https', 'http'])) image = hote + image
					rss += '      <media:thumbnail url="' + echapperXML(image) + '" />\n'
					rss += '      <media:content url="' + echapperXML(image) + '" medium="image" />\n'
				}
			}
			try {
				const valeurDate = blocs[i].date
				if (typeof valeurDate === 'string' && valeurDate.trim() !== '') {
					const date = new Date(valeurDate)
					if (!isNaN(date.getTime())) {
						rss += '      <pubDate>' + date.toUTCString() + '</pubDate>\n'
					}
				}
			} catch (err) {
				console.error(err.message)
			}
			rss += '      <guid>' + echapperXML(lien) + '?caps=' + blocs[i].bloc.replace('bloc-id-', '') + '</guid>\n'
			rss += '    </item>\n'
		} catch (err) {
			console.error(err.message)
		}
	}
	rss += '  </channel>\n'
	rss += '</rss>'
	return rss
}

export default genererXML
