/**
 * @fileoverview Moniteur d'incidents Google Workspace avec alertes par email.
 * Ce script interroge le flux Atom officiel de Google Status, détecte les nouveaux
 * incidents et envoie une notification formatée. Il inclut un moteur de 
 * nettoyage HTML spécifique pour convertir les heures UTC du flux en heure locale
 * et réparer les liens relatifs cassés.
 *
 * Fonctionnalités clés :
 * - Parsing XML via XmlService (Atom Namespace).
 * - Conversion intelligente des dates (Regex + Intl.DateTimeFormat).
 * - Persistance des IDs traités via PropertiesService (anti-doublon).
 * - Templating Email HTML responsive avec signature.
 *
 * @filename   Code.gs
 * @version    6.2.1
 * @date       14 décembre 2025
 * @author     Fabrice Faucheux
 * @license    MIT (https://opensource.org/licenses/MIT)
 */

// --- CONFIGURATION ---
const URL_FLUX = "https://www.google.com/appsstatus/dashboard/fr/feed.atom";
const CLE_IDS_VUS = "STATUT_GOOGLE_IDS_VUS";
const LIMITE_HISTORIQUE = 50;
const URL_FALLBACK = "https://www.google.com/appsstatus/dashboard/";
const LOCALE_LANGUE = "fr-FR";

/**
 * FONCTION PRINCIPALE
 */
function verifierStatutGoogleWorkspace() {
  try {
    const reponse = UrlFetchApp.fetch(URL_FLUX);
    traiterFluxAtom(reponse.getContentText());
  } catch (erreur) {
    console.error(`[CRITIQUE] Impossible de récupérer le flux : ${erreur.message}`);
  }
}

/**
 * Traite le flux Atom et détecte les nouveaux incidents.
 * @param {string} contenuXml - Le XML brut.
 */
function traiterFluxAtom(contenuXml) {
  try {
    const serviceProprietes = PropertiesService.getScriptProperties();
    const idsStockes = JSON.parse(serviceProprietes.getProperty(CLE_IDS_VUS) || "[]");
    const ensembleIdsVus = new Set(idsStockes);

    const documentXml = XmlService.parse(contenuXml);
    const racine = documentXml.getRootElement();
    const nsAtom = XmlService.getNamespace("http://www.w3.org/2005/Atom");
    
    const entrees = nsAtom ? racine.getChildren("entry", nsAtom) : racine.getChildren("entry");
    
    let nouveauxDetectes = false;
    const fuseauScript = Session.getScriptTimeZone(); 

    [...entrees].reverse().forEach(entree => {
      const id = nsAtom ? entree.getChild("id", nsAtom).getText() : entree.getChild("id").getText();

      if (!ensembleIdsVus.has(id)) {
        console.info(`Traitement de l'incident : ${id}`);
        nouveauxDetectes = true;

        const titre = nsAtom ? entree.getChild("title", nsAtom).getText() : entree.getChild("title").getText();
        const dateRaw = nsAtom ? entree.getChild("updated", nsAtom).getText() : entree.getChild("updated").getText();
        
        // Extraction de l'URL spécifique de l'incident (Crucial pour le lien anglais)
        const lienPrincipal = extraireLienPrincipal(entree, nsAtom);
        
        let resumeBrut = nsAtom ? entree.getChild("summary", nsAtom).getText() : entree.getChild("summary").getText();

        // --- TRAITEMENT DU CONTENU HTML ---
        
        // 1. Réparation des liens relatifs en utilisant le lien de l'incident comme base
        let resumeTraite = reparerLiensRelatifs(resumeBrut, lienPrincipal);

        // 2. Conversion des dates UTC vers Locale
        resumeTraite = convertirHeuresDansHtml(resumeTraite, fuseauScript);

        // 3. Nettoyage du label UTC
        resumeTraite = nettoyerLabelUtc(resumeTraite);

        envoyerAlerteEmail({
          titre: titre,
          lien: lienPrincipal,
          resumeHtml: resumeTraite,
          dateBrute: dateRaw,
          fuseau: fuseauScript
        });

        ensembleIdsVus.add(id);
      }
    });

    if (nouveauxDetectes) {
      const listeSauvegarde = Array.from(ensembleIdsVus).slice(-LIMITE_HISTORIQUE);
      serviceProprietes.setProperty(CLE_IDS_VUS, JSON.stringify(listeSauvegarde));
    }

  } catch (erreur) {
    console.error(`Erreur de parsing XML : ${erreur.stack}`);
  }
}

// --- MOTEUR DE TRANSFORMATION ---

function nettoyerLabelUtc(html) {
  if (!html) return "";
  const regexSpanUtc = /<span[^>]*>\s*\(fuseau\s+horaire\s+<strong[^>]*>UTC<\/strong>\)\s*<\/span>/gi;
  return html.replace(regexSpanUtc, "");
}

function convertirHeuresDansHtml(html, fuseauCible) {
  if (!html) return "";
  const regexDateIso = /<strong[^>]*>(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})<\/strong>/gi;

  return html.replace(regexDateIso, (match, datePart, timePart) => {
    try {
      const [annee, mois, jour] = datePart.split('-').map(Number);
      const [heure, minute] = timePart.split(':').map(Number);
      const dateUtc = new Date(Date.UTC(annee, mois - 1, jour, heure, minute));

      const dateLocale = new Intl.DateTimeFormat(LOCALE_LANGUE, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: fuseauCible
      }).format(dateUtc);

      return `<strong>${dateLocale}</strong>`;
    } catch (e) {
      return match;
    }
  });
}

/**
 * CORRECTION APPLIQUÉE ICI
 * Utilise 'urlDeReference' (l'incident) comme base, et non plus le fallback global.
 */
function reparerLiensRelatifs(htmlFragment, urlDeReference) {
  if (!htmlFragment) return "";
  // Si urlDeReference existe, on l'utilise comme préfixe pour le lien ?hl=en
  const base = urlDeReference || URL_FALLBACK;
  
  return htmlFragment.replace(/href="\?(?!http)/g, `href="${base}?`);
}

function extraireLienPrincipal(elementEntree, ns) {
  const liens = ns ? elementEntree.getChildren("link", ns) : elementEntree.getChildren("link");
  const lienTrouve = liens.find(l => {
    const rel = l.getAttribute("rel") ? l.getAttribute("rel").getValue() : "alternate";
    return rel === "alternate";
  });
  return lienTrouve ? lienTrouve.getAttribute("href").getValue() : URL_FALLBACK;
}

function formaterDateEntete(dateIsoString, fuseau) {
  if (!dateIsoString) return "Date inconnue";
  try {
    return new Intl.DateTimeFormat(LOCALE_LANGUE, {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: fuseau
    }).format(new Date(dateIsoString));
  } catch (e) {
    return dateIsoString;
  }
}

// --- ENVOI EMAIL ---

function envoyerAlerteEmail({ titre, lien, resumeHtml, dateBrute, fuseau }) {
  const destinataire = Session.getActiveUser().getEmail();
  const dateAffichee = formaterDateEntete(dateBrute, fuseau);
  const titrePropre = titre.replace(/\sUTC$/, "");

  const htmlBody = `
    <div style="font-family: 'Google Sans', Roboto, Arial, sans-serif; color: #202124; max-width: 600px; border: 1px solid #dadce0; border-radius: 8px; overflow:hidden;">
      
      <div style="background-color: #d93025; color: white; padding: 18px 24px;">
        <h2 style="margin:0; font-size: 18px; line-height: 24px;">Alerte Google Workspace</h2>
      </div>
      
      <div style="padding: 24px;">
        <h3 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 400;">${titrePropre}</h3>
        
        <div style="display: flex; align-items: center; margin-bottom: 24px; color: #5f6368; font-size: 14px;">
          <span style="margin-right: 8px;">🕒</span>
          <strong>Signalé le :</strong>&nbsp;${dateAffichee}
        </div>
        
        <div style="background-color: #f8f9fa; padding: 16px; border-radius: 4px; border: 1px solid #e8eaed; line-height: 1.6;">
          ${resumeHtml}
        </div>

        <div style="margin-top: 24px; text-align: center;">
          <a href="${lien}" style="background-color: #1a73e8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: 500; font-size: 14px;">
            Voir le statut en direct
          </a>
        </div>
      </div>

      <div style="background-color: #f1f3f4; padding: 15px; text-align: center; font-size: 11px; color: #5f6368; border-top: 1px solid #e0e0e0;">
        Automatisé avec <strong>Google Apps Script</strong> &bull; Développement par <strong>Fabrice Faucheux</strong>
      </div>
    </div>
  `;
  
  MailApp.sendEmail({
    to: destinataire,
    subject: `⚠️ ${titrePropre}`,
    htmlBody: htmlBody
  });
}
