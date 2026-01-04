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
    formData.append('is_private', '0'); // Public file (0) veya private file (1)
    
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
    if (result?.message?.file_url) {
      return result.message.file_url;
    } else if (result?.message?.file_name) {
      // Eğer sadece file_name dönerse, URL'i oluştur
      return `/files/${result.message.file_name}`;
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