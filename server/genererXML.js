import 'dotenv/config'
import { convert } from 'html-to-text'
import t from './lang.js'

function verifierURL (s, protocoles) {
	try {
		const url = new URL(s)
		return protocoles ? url.protocol ? protocoles.map(x => `${x.toLowerCase()}:`).includes(url.protocol) : false : true
	} catch (err) {
		return false
	}
}

function definirCheminFichier (hote, id, fichier) {
	if (process.env.VITE_STORAGE && process.env.VITE_STORAGE === 's3' && process.env.VITE_S3_PUBLIC_LINK && process.env.VITE_S3_PUBLIC_LINK !== '') {
		return process.env.VITE_S3_PUBLIC_LINK + '/' + id + '/' + fichier
	} else {
		return hote + '/fichiers/' + id + '/' + fichier
	}
}

function genererXML (hote, id, titre, lien, blocs, admin, langue) {
	let rss = '<?xml version="1.0" encoding="UTF-8"?>\n'
	rss += '<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">\n'
	rss += '  <channel>\n'
	rss += '    <title>' + titre + '</title>\n'
	rss += '    <link>' + lien  + '</link>\n'
	rss += '    <description>' + t[langue].fluxRSS + ' "' + titre + '"</description>\n'
	rss += '    <language>' + langue + '</language>\n'
	// Ajouter les blocs
	for (let i = 0; i < blocs.length; i++) {
		if (admin || blocs[i].visibilite === 'visible') {
			rss += '    <item>\n'
			let titre = blocs[i].titre
			if (titre === '') {
				titre = t[langue].capsuleSansTitre
			}
			if (blocs[i].nom !== '') {
				rss += '      <title>' + titre + ' (' + t[langue].par + ' ' + blocs[i].nom + ')</title>\n'
			} else {
				rss += '      <title>' + titre + '</title>\n'
			}
			rss += '      <link>' + lien + '?caps=' + blocs[i].bloc.replace('bloc-id-', '') + '</link>\n'
			if (blocs[i].texte !== '') {
				rss += '      <description>' + convert(blocs[i].texte, { wordwrap: 100 }) + '</description>\n'
			}
			if (blocs[i].type === 'image' || blocs[i].type === 'lien-image' || blocs[i].vignette !== '') {
				let image
				if (blocs[i].type === 'image' || blocs[i].type === 'lien-image') {
					image = blocs[i].media
				} else if (blocs[i].vignette !== '') {
					image = blocs[i].vignette
				}
				if (!verifierURL(image, ['https', 'http']) && image.substring(0, 5) !== '/img/') {
					image = definirCheminFichier(hote, id, image)
				} else if (!verifierURL(image, ['https', 'http']) && image.substring(0, 5) === '/img/') {
					image = hote + image
				}
				rss += '      <media:thumbnail url="' + image + '" />\n'
				rss += '      <media:content url="' + image + '" medium="image" />\n'
			}
			rss += '      <pubDate>' + new Date(blocs[i].date).toUTCString() + '</pubDate>\n'
			rss += '      <guid>' + lien + '?caps=' + blocs[i].bloc.replace('bloc-id-', '') + '</guid>\n'
			rss += '    </item>\n'
		}
	}
	rss += '  </channel>\n'
	rss += '</rss>'
	return rss
}

export default genererXML
