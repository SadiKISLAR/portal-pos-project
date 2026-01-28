import { NextRequest, NextResponse } from "next/server";
import { erpGet } from "@/lib/erp";

export const dynamic = 'force-dynamic';

// E-imza belge şablonunu Lead bilgileriyle doldur
function fillDocumentTemplate(lead: any): string {
  // Bugünün tarihi
  const today = new Date();
  const formattedDate = today.toLocaleDateString('de-DE', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });

  // Lead'den bilgileri al
  const companyName = lead.company_name || lead.lead_name || "";
  const street = lead.address_line1 || "";
  const city = lead.city || "";
  const pincode = lead.pincode || "";
  const country = lead.country || "Germany";
  
  // Business/Contact bilgileri
  let ownerName = "";
  let ownerBirthdate = "";
  let ownerBirthplace = "";
  let ownerAddress = "";
  let hrbNumber = "";
  
  // custom_businesses'dan bilgi çekmeye çalış
  if (lead.custom_businesses) {
    try {
      const businesses = typeof lead.custom_businesses === 'string' 
        ? JSON.parse(lead.custom_businesses) 
        : lead.custom_businesses;
      
      if (Array.isArray(businesses) && businesses.length > 0) {
        const firstBusiness = businesses[0];
        ownerName = firstBusiness.ownerDirector || "";
        ownerAddress = firstBusiness.street ? 
          `${firstBusiness.street}, ${firstBusiness.postalCode || ""} ${firstBusiness.city || ""}` : "";
      }
    } catch (e) {
      console.error("Error parsing businesses:", e);
    }
  }

  // Full address string
  const fullAddress = [street, pincode, city].filter(Boolean).join(", ");
  const ownerFullAddress = ownerAddress || fullAddress;

  // HTML Template - Lead bilgileriyle doldurulmuş
  const documentHtml = `
<div class="contract-document" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; line-height: 1.6; color: #333;">
  <h3 style="color: #4ab2e8; text-align: center; margin-bottom: 40px;">MITGLIEDSVERTRAG</h3>
  
  <div style="width: 100%;">
    <!-- Einleitung -->
    <p style="margin-top: 40px;">geschlossen zwischen</p>
    <p style="margin-top: 10px;">
      CC CULINARY COLLECTIVE GmbH,<br />
      Hohenzollerndamm 58, 14199 Berlin,<br />
      vertreten durch den Geschäftsführer Enver Taskin,<br />
      geb. am 01.01.1975 in Tuzluca, wohnhaft in Ackerstraße 14, 14621 Schönwalde-Glien
    </p>
    <p style="margin-top: 10px;">– nachfolgend „CC CULINARY COLLECTIVE" genannt –</p>
    <p style="margin-top: 10px;">und</p>
    
    <!-- Restaurant / Café Tabelle -->
    <table style="width: 100%; border-collapse: collapse; margin: 25px 0;">
      <tbody>
        <tr>
          <td style="border: 1px solid #3b4652; padding: 10px; height: 45px; width: 30%; background-color: #f9fafb;">
            Name und Anschrift des Restaurants/Cafés.<br />(natürliche oder juristische Person)
          </td>
          <td style="border: 1px solid #3b4652; padding: 10px; height: 45px;">
            <strong>${companyName}</strong><br/>
            ${fullAddress}
          </td>
        </tr>
        <tr>
          <td style="border: 1px solid #3b4652; padding: 10px; height: 45px; background-color: #f9fafb;">
            Inhaber des Restaurants/Cafés.<br />Wenn juristische Person ist: Anschrift und HRB Nr. der Gesellschaft
          </td>
          <td style="border: 1px solid #3b4652; padding: 10px; height: 45px;">
            ${ownerName || companyName}${hrbNumber ? `, HRB: ${hrbNumber}` : ""}
          </td>
        </tr>
        <tr>
          <td style="border: 1px solid #3b4652; padding: 10px; height: 45px; background-color: #f9fafb;">
            vertreten durch, geb. am, geboren in
          </td>
          <td style="border: 1px solid #3b4652; padding: 10px; height: 45px;">
            ${ownerName}${ownerBirthdate ? ` / ${ownerBirthdate}` : ""}${ownerBirthplace ? ` ${ownerBirthplace}` : ""}
          </td>
        </tr>
        <tr>
          <td style="border: 1px solid #3b4652; padding: 10px; height: 45px; background-color: #f9fafb;">
            wohnhaft in
          </td>
          <td style="border: 1px solid #3b4652; padding: 10px; height: 45px;">
            ${ownerFullAddress}
          </td>
        </tr>
      </tbody>
    </table>
    
    <p style="margin-top: 10px;">– nachfolgend „Restaurant/Café" genannt –</p>
    
    <p style="margin-top: 20px;">
      CC CULINARY COLLECTIVE GmbH und das Restaurant/Café sowie alle künftigen Vertragspartner dieser Rahmenvereinbarung 
      (im Folgenden „Vereinbarung") werden jeweils als „Vertragspartner" und gemeinsam als „Vertragsparteien" bezeichnet.
    </p>
    
    <!-- 1. Präambel -->
    <p style="margin-top: 20px; font-weight: bold; color: #4ab2e8; text-decoration: underline;">1. Präambel</p>
    <ol style="margin-top: 5px; margin-left: 20px; padding-left: 20px;" type="a">
      <li style="margin-bottom: 5px;">
        Die CC CULINARY COLLECTIVE GmbH ist eine Plattform, die Gastronomie-Marken mit Cafés, Restaurants und Einzelhandelsgeschäften zusammenbringt. 
        Ziel ist es, die Umsätze der Partner durch die Eröffnung von Shop-in-Shop- und Cloud-Kitchen-Konzept-Filialen in Geschäften zu steigern 
        und die Kosten von Restaurants mit verschiedenen Dienstleistungen zu reduzieren.
      </li>
      <li style="margin-bottom: 5px;">
        Das Restaurant/Café beabsichtigt, die Dienstleistungen der CC CULINARY COLLECTIVE GmbH in Anspruch zu nehmen und 
        in seinen Räumlichkeiten Marken der Plattform zu.
      </li>
    </ol>
    
    <!-- 2. Vertragsgegenstand -->
    <p style="margin-top: 20px; font-weight: bold; color: #4ab2e8; text-decoration: underline;">2. Vertragsgegenstand</p>
    <ol style="margin-top: 5px; margin-left: 20px; padding-left: 20px;" type="a">
      <li style="margin-bottom: 5px;">
        Ziel der Plattform ist es, ihren Mitgliedern durch Nutzung gemeinsamer kommerzieller Ressourcen – insbesondere durch 
        Online-Verkaufsplattformen, Energieanbieter, Versicherungsunternehmer, Großhändler, IT-Unternehmer, usw. – wirtschaftliche Vorteile zu verschaffen.
      </li>
      <li style="margin-bottom: 5px;">
        Die CC-Plattform überwacht und koordiniert die Geschäftsbeziehungen sowie Qualitätsstandards aller teilnehmenden Mitgliedsunternehmen.
      </li>
      <li style="margin-bottom: 5px;">
        Nach Zustimmung der CC CULINARY COLLECTIVE GmbH und des Markeninhabers nimmt die Shop-in-Shop-Filiale ihren Betrieb auf.
      </li>
      <li style="margin-bottom: 5px;">
        Aus Gründen des Konkurrenzschutzes darf in einem Umkreis von mindestens 2 km um die Shop-in-Shop-Filiale keine weitere Filiale der gleichen Marke eröffnet werden.
      </li>
      <li style="margin-bottom: 5px;">
        Der Restaurantbesitzer verpflichtet sich, das vom Markeninhaber festgelegte Menü in der gleichen Weise wie der Markeninhaber zu produzieren 
        und die Qualitätsstandards einzuhalten. Darüber hinaus verpflichtet sich der Restaurantbesitzer, die für die Herstellung dieses Menüs 
        erforderlichen Produkte entweder vom Markeninhaber oder von einem vom Markeninhaber bestimmten Lieferanten zu beziehen.
      </li>
      <li style="margin-bottom: 5px;">
        Bei Lieferverzögerungen durch Marken oder Lieferanten kann die CC CULINARY COLLECTIVE GmbH Abmahnungen aussprechen. 
        Nach der zweiten Abmahnung wird versucht, alternative Lieferanten zu finden.
      </li>
    </ol>
    
    <!-- 3. Vertragslaufzeit und Kündigung -->
    <p style="margin-top: 20px; font-weight: bold; color: #4ab2e8; text-decoration: underline;">3. Vertragslaufzeit und Kündigung</p>
    <ol style="margin-top: 5px; margin-left: 20px; padding-left: 20px;" type="a">
      <li style="margin-bottom: 5px;">Die Vereinbarung wird auf unbestimmte Zeit geschlossen.</li>
      <li style="margin-bottom: 5px;">Beide Parteien können die Vereinbarung mit einer Frist von drei (3) Monaten zum Monatsende ordentlich kündigen.</li>
      <li style="margin-bottom: 5px;">
        Eine fristlose Kündigung ist insbesondere dann möglich, wenn:
        <ul style="margin-top: 5px; margin-left: 20px; padding-left: 15px; list-style-type: disc;">
          <li style="margin-bottom: 3px;">eine Partei wiederholt oder erheblich gegen die Vereinbarung verstößt oder</li>
          <li style="margin-bottom: 3px;">ein Verstoß nach schriftlicher Aufforderung nicht innerhalb von 30 Tagen behoben wird oder</li>
          <li style="margin-bottom: 3px;">über das Vermögen einer Partei ein Insolvenzverfahren beantragt oder eröffnet wird oder</li>
          <li style="margin-bottom: 3px;">eine Partei ihre Geschäftstätigkeit für mehr als 30 Tage einstellt (außer bei höherer Gewalt).</li>
        </ul>
      </li>
      <li style="margin-bottom: 5px;">
        Im Falle der Vertragsbeendigung behält sich die CC CULINARY COLLECTIVE GmbH das Recht vor, sämtliche Listungen (virtuell und physisch) 
        des Restaurants auf der eigenen Plattform sowie bei Partnerdiensten Lieferando, Uber Eats und Wolt auszusetzen oder zu entfernen.
      </li>
    </ol>
    
    <!-- 4. Übertragung von Rechten und Pflichten -->
    <p style="margin-top: 20px; font-weight: bold; color: #4ab2e8; text-decoration: underline;">4. Übertragung von Rechten und Pflichten</p>
    <ol style="margin-top: 5px; margin-left: 20px; padding-left: 20px;" type="a">
      <li style="margin-bottom: 5px;">
        Beide Vertragsparteien dürfen Rechte und Pflichten aus dieser Vereinbarung mit Zustimmung der jeweils anderen Partei auf Dritte übertragen.
      </li>
      <li style="margin-bottom: 5px;">
        Die CC CULINARY COLLECTIVE GmbH ist berechtigt, einzelne Leistungen durch Dritte im eigenen Namen erbringen zu lassen.
      </li>
    </ol>
    
    <!-- 5. Wettbewerbsverbot -->
    <p style="margin-top: 20px; font-weight: bold; color: #4ab2e8; text-decoration: underline;">5. Wettbewerbsverbot</p>
    <ul style="margin-top: 5px; margin-left: 20px; padding-left: 15px; list-style-type: square;">
      <li style="margin-bottom: 5px;">
        Zum Schutz vor direkter Konkurrenz verpflichtet sich der Lizenznehmer, weder selbst noch über Dritte ein mit den Marken konkurrierendes 
        Geschäftskonzept mit ähnlichen Produkten zu entwickeln, zu betreiben oder zu unterstützen in Vertragsgebiet.<br />
        Dies umfasst insbesondere die Nutzung eines vergleichbaren Geschäftsmodells, Markenauftritts oder Produktangebots, 
        das in direkter Konkurrenz zu den oben genannten Marken stehen könnte.<br />
        Das Wettbewerbsverbot gilt auch für zwei (2) Jahre nach Ablauf der Vereinbarung.
      </li>
    </ul>
    
    <!-- 6. Haftung -->
    <p style="margin-top: 20px; font-weight: bold; color: #4ab2e8; text-decoration: underline;">6. Haftung</p>
    <p style="margin-left: 20px; margin-top: 5px;">
      Die CC CULINARY COLLECTIVE GmbH haftet nur bei Vorsatz oder grober Fahrlässigkeit. Eine Haftung für mittelbare Schäden oder Folgeschäden 
      ist ausgeschlossen. Ereignisse höherer Gewalt gelten nicht als Vertragsverstoß.
    </p>
    
    <!-- 7. Vertraulichkeit und Datenschutz -->
    <p style="margin-top: 20px; font-weight: bold; color: #4ab2e8; text-decoration: underline;">7. Vertraulichkeit und Datenschutz</p>
    <ol style="margin-top: 5px; margin-left: 20px; padding-left: 20px;" type="a">
      <li style="margin-bottom: 5px;">
        Vertragsbezogene Informationen sind vertraulich zu behandeln und nur für interne Zwecke zu verwenden. 
        Diese Pflicht gilt auch zwei (2) Jahre nach Vertragsbeendigung fort.
      </li>
      <li style="margin-bottom: 5px;">
        Beide Parteien sind eigenständig für den Schutz personenbezogener Daten verantwortlich. 
        Verstöße gegen Datenschutzbestimmungen können zu Schadensersatzansprüchen führen.
      </li>
    </ol>
    
    <!-- 8. Marken- und Werbenutzung -->
    <p style="margin-top: 20px; font-weight: bold; color: #4ab2e8; text-decoration: underline;">8. Marken- und Werbenutzung</p>
    <ol style="margin-top: 5px; margin-left: 20px; padding-left: 20px;" type="a">
      <li style="margin-bottom: 5px;">
        Die Vertragsparteien dürfen jeweils Namen und Marken der anderen Partei für Marketingzwecke nutzen.
      </li>
      <li style="margin-bottom: 5px;">
        Pressemitteilungen oder Kampagnen bedürfen der vorherigen schriftlichen Zustimmung der jeweils anderen Partei.
      </li>
    </ol>
    
    <!-- 9. Schlussbestimmungen -->
    <p style="margin-top: 20px; font-weight: bold; color: #4ab2e8; text-decoration: underline;">9. Schlussbestimmungen</p>
    <ol style="margin-top: 5px; margin-left: 20px; padding-left: 20px;" type="a">
      <li style="margin-bottom: 5px;">Änderungen oder Ergänzungen dieser Vereinbarung bedürfen der Schriftform.</li>
      <li style="margin-bottom: 5px;">
        Sollten einzelne Bestimmungen dieser Vereinbarung ganz oder teilweise unwirksam sein, bleibt die Wirksamkeit der übrigen Regelungen unberührt.
      </li>
      <li style="margin-bottom: 5px;">Es gilt deutsches Recht. Gerichtsstand ist Berlin.</li>
    </ol>
    
    <!-- Anlagen -->
    <div style="margin-top: 40px;">
      <p style="margin: 0; font-weight: bold;">Anlagen</p>
      <p style="margin: 2px 0;">I. Widerrufsformulare</p>
      <p style="margin: 2px 0;">II. Restaurant-Registrierung</p>
      <p style="margin: 2px 0;">III. Markennutzungsvereinbarungen</p>
      <p style="margin: 2px 0;">IV. Ausweise, Gewerbeanmeldung, Handelsregisterauszug</p>
      <p style="margin: 2px 0;">V. Gesellschafterliste</p>
      <p style="margin: 2px 0;">VI. UBO-Erklärung</p>
    </div>
    
    <!-- Unterschriftenbereich -->
    <table style="border-collapse: collapse; width: 100%; margin-top: 40px;">
      <tbody>
        <tr>
          <td style="border: 1px solid #3b4652; padding: 15px; width: 50%; vertical-align: top;">
            <p style="margin: 0;">
              ${city || "Ort"}, den ${formattedDate}<br /><br />
              Restaurant/Café<br />
              <strong>${companyName}</strong><br /><br />
              ${ownerName || "[Name]"}, Inhaber/Geschäftsführer<br />
              Unterschrift:
            </p>
            <div id="customer-signature" style="min-height: 80px; border-bottom: 1px solid #ccc; margin-top: 10px;"></div>
          </td>
          <td style="border: 1px solid #3b4652; padding: 15px; width: 50%; vertical-align: top;">
            <p style="margin: 0;">
              Berlin, den ${formattedDate}<br /><br />
              CC CULINARY COLLECTIVE GmbH<br /><br />
              Enver Taskin, Geschäftsführer<br />
              Unterschrift:
            </p>
            <div style="min-height: 80px; margin-top: 10px;">
              <img src="/images/cc-signature.png" alt="CC Signature" style="max-height: 60px;" onerror="this.style.display='none'" />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
  `;

  return documentHtml;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const signatureToken = searchParams.get("token");

    if (!signatureToken) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    const token = process.env.ERP_API_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "API token missing" }, { status: 500 });
    }

    // Token ile Lead'i bul
    const leadFilters = encodeURIComponent(JSON.stringify([["custom_esignature_token", "=", signatureToken]]));
    const leadResult = await erpGet(`/api/resource/Lead?filters=${leadFilters}&limit_page_length=1`, token);
    const leads = leadResult?.data || (Array.isArray(leadResult) ? leadResult : []);

    if (leads.length === 0) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
    }

    const leadName = leads[0].name;

    // Lead'in tam verisini çek
    const fullLeadRes = await erpGet(`/api/resource/Lead/${encodeURIComponent(leadName)}`, token);
    const lead = fullLeadRes?.data || fullLeadRes;

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Token süresini kontrol et
    if (lead.custom_esignature_token_expiry) {
      const expiryDate = new Date(lead.custom_esignature_token_expiry);
      if (expiryDate < new Date()) {
        return NextResponse.json({ error: "Token expired" }, { status: 410 });
      }
    }

    // Zaten imzalanmış mı kontrol et
    if (lead.custom_esignature_signed_at) {
      return NextResponse.json({ 
        error: "Document already signed",
        signedAt: lead.custom_esignature_signed_at 
      }, { status: 409 });
    }

    // Belgeyi Lead bilgileriyle doldur
    const documentHtml = fillDocumentTemplate(lead);

    return NextResponse.json({
      success: true,
      document: documentHtml,
      lead: {
        name: lead.name,
        companyName: lead.company_name || lead.lead_name,
        email: lead.email_id,
        city: lead.city,
        status: lead.custom_registration_status
      }
    });

  } catch (e: any) {
    console.error("❌ Get e-signature document failed:", e);
    return NextResponse.json({ 
      error: e.message || "Server Error",
      details: e?.response?.data 
    }, { status: 500 });
  }
}
