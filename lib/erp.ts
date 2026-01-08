const BASE = process.env.NEXT_PUBLIC_ERP_BASE_URL;

if (!BASE) {
  throw new Error('NEXT_PUBLIC_ERP_BASE_URL environment variable is not set. Please create a .env.local file with NEXT_PUBLIC_ERP_BASE_URL=http://your-erp-url');
}

async function handle(res: Response) {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

export async function erpLogin(email: string, password: string) {
  const res = await fetch(`${BASE}/api/method/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      usr: email,
      pwd: password,
    }),
    cache: 'no-store',
  });
  
  if (!res.ok) {
    const text = await res.text();
    
    // HTML hata sayfası gelirse, içinden hata mesajını çıkar
    if (text.includes('AuthenticationError') || text.includes('Invalid login credentials')) {
      throw new Error('Invalid username or password');
    }
    
    if (text.includes('BrokenPipeError')) {
      throw new Error('Server connection error. Please try again.');
    }
    
    // JSON hata mesajı gelirse parse et
    try {
      const errorJson = JSON.parse(text);
      if (errorJson.message) {
        throw new Error(errorJson.message);
      }
    } catch (parseError: any) {
      // Eğer zaten bir Error throw edildiyse (yukarıdaki throw), onu tekrar fırlat
      if (parseError instanceof Error && parseError.message !== text) {
        throw parseError;
      }
    }
    
    // Yukarıdaki kontrollerden geçtiyse, genel hata mesajı
    throw new Error('Login failed. Please check your username and password.');
  }
  
  const result = await handle(res);
  
  // Frappe/ERPNext login returns user info on success
  if (result && (result.message === 'Logged In' || result.full_name)) {
    return {
      success: true,
      user: result.full_name || email,
      email: email,
    };
  }
  
  throw new Error('Login failed');
}

export async function erpGet(path: string, token?: string) {
  const headers: HeadersInit = {
    'Accept': 'application/json',
  };
  
  // GET isteklerinde Content-Type gerekmez, bu 417 hatasına neden olabilir
  // Sadece Authorization header'ı ekle
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }
  
  const res = await fetch(`${BASE}${path}`, {
    method: 'GET',
    headers,
    cache: 'no-store',
    // Expect header'ını kaldırmak için redirect ve credentials ayarları
    redirect: 'follow',
  });
  return handle(res);
}

export async function erpPost(path: string, body: any, token?: string) {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }
  
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return handle(res);
}

export async function erpPut(path: string, body: any, token?: string) {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }
  
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  return handle(res);
}

/**
 * ERPNext'e file upload eder
 * @param file File objesi
 * @param folder Folder path (örn: "Home/Attachments/Lead")
 * @param token API token
 * @returns Upload edilen file'ın URL'i
 */
export async function erpUploadFile(file: File, folder: string = "Home/Attachments", token?: string): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    // ERPNext varsayılan olarak dosyaları private olarak yüklüyor
    // is_private: 1 = /private/files/ altında (varsayılan)
    // is_private: 0 = /files/ altında (public)
    formData.append('is_private', '1'); // Private file - ERPNext'in varsayılan davranışı
    
    const headers: HeadersInit = {};
    
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }
    
    // FormData kullanırken Content-Type header'ını set etme (browser otomatik ayarlar)
    // Node.js'te de FormData otomatik olarak boundary ekler
    
    const res = await fetch(`${BASE}/api/method/upload_file`, {
      method: 'POST',
      headers,
      body: formData,
    });
    
    if (!res.ok) {
      const text = await res.text();
      console.error(`File upload failed. Status: ${res.status}, Response: ${text}`);
      throw new Error(`File upload failed (${res.status}): ${text}`);
    }
    
    // Response'u text olarak al, sonra parse et
    const text = await res.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (parseError) {
      console.error(`Failed to parse upload response: ${text}`);
      throw new Error(`Invalid JSON response from upload_file: ${text.substring(0, 200)}`);
    }
    
    // ERPNext upload_file response formatı: { message: { file_url: "...", ... } }
    // file_url zaten doğru path'i içeriyor (/private/files/ veya /files/)
    if (result?.message?.file_url) {
      console.log(`File uploaded, URL from ERPNext: ${result.message.file_url}`);
      return result.message.file_url;
    } else if (result?.message?.file_name) {
      // Eğer sadece file_name dönerse, private files URL'i oluştur
      // ERPNext varsayılan olarak /private/files/ kullanıyor
      const fileUrl = `/private/files/${result.message.file_name}`;
      console.log(`File uploaded, constructed URL: ${fileUrl}`);
      return fileUrl;
    } else if (result?.message) {
      // Başka bir format olabilir, message objesini kontrol et
      console.warn('Unexpected upload_file response format:', JSON.stringify(result.message));
      // file_name veya file_url yoksa, message'ı string olarak döndür
      if (typeof result.message === 'string') {
        return result.message;
      }
    }
    
    console.error('Upload response:', JSON.stringify(result));
    throw new Error(`File upload response format is invalid: ${JSON.stringify(result)}`);
  } catch (error: any) {
    const fileName = file instanceof File ? file.name : 'unknown';
    console.error(`Error in erpUploadFile for file ${fileName}:`, error);
    throw error;
  }
}

/**
 * ERPNext'te File kaydını Lead'e bağlar (Attach)
 * upload_file zaten File kaydı oluşturur, sadece attached_to_doctype ve attached_to_name güncellenir
 * @param fileUrl Upload edilen file'ın URL'i
 * @param fileName Dosya adı (file_url'den çıkarılabilir)
 * @param attachedToDoctype Bağlı olduğu DocType (örn: "Lead")
 * @param attachedToName Bağlı olduğu kayıtın name'i (örn: Lead name)
 * @param token API token
 * @returns Güncellenen File kaydı
 */
export async function erpCreateAttach(
  fileUrl: string,
  fileName: string,
  attachedToDoctype: string,
  attachedToName: string,
  token?: string
): Promise<any> {
  try {
    // fileUrl'den file_name'i çıkar (örn: /files/document.pdf -> document.pdf)
    // Eğer fileName verilmişse onu kullan, yoksa fileUrl'den çıkar
    const actualFileName = fileName || fileUrl.split('/').pop() || 'unknown';
    
    // Önce File kaydını bul (file_url veya file_name ile)
    let fileRecord = null;
    try {
      // file_url ile ara
      const fileUrlFilters = encodeURIComponent(JSON.stringify([["file_url", "=", fileUrl]]));
      const fileResult = await erpGet(`/api/resource/File?filters=${fileUrlFilters}&limit_page_length=1`, token);
      const files = fileResult?.data || (Array.isArray(fileResult) ? fileResult : []);
      
      if (Array.isArray(files) && files.length > 0) {
        fileRecord = files[0];
      } else {
        // file_name ile ara
        const fileNameFilters = encodeURIComponent(JSON.stringify([["file_name", "=", actualFileName]]));
        const fileNameResult = await erpGet(`/api/resource/File?filters=${fileNameFilters}&limit_page_length=1`, token);
        const filesByName = fileNameResult?.data || (Array.isArray(fileNameResult) ? fileNameResult : []);
        
        if (Array.isArray(filesByName) && filesByName.length > 0) {
          fileRecord = filesByName[0];
        }
      }
    } catch (searchError: any) {
      console.warn(`Could not find existing File record:`, searchError.message);
    }
    
    if (fileRecord && fileRecord.name) {
      // Mevcut File kaydını güncelle
      const updatePayload = {
        attached_to_doctype: attachedToDoctype,
        attached_to_name: attachedToName,
      };
      
      const result = await erpPut(`/api/resource/File/${encodeURIComponent(fileRecord.name)}`, updatePayload, token);
      return result;
    } else {
      // File kaydı bulunamadı, yeni oluştur
      const attachPayload = {
        file_name: actualFileName,
        file_url: fileUrl,
        attached_to_doctype: attachedToDoctype,
        attached_to_name: attachedToName,
        is_private: 1, // Private file - ERPNext varsayılan davranışı (/private/files/)
      };

      const result = await erpPost("/api/resource/File", attachPayload, token);
      return result;
    }
  } catch (error: any) {
    console.error(`Error creating/updating Attach for ${fileName}:`, error);
    throw error;
  }
}