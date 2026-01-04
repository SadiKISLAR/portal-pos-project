/**
 * Basit ERPNext File Upload Test
 * Browser Console'da çalıştırın
 */

async function testUpload() {
  const token = '1408bd2881b1ef4:7009af27ae426a8';
  
  // Basit bir test dosyası oluştur
  const fileContent = 'Test document content';
  const blob = new Blob([fileContent], { type: 'text/plain' });
  const file = new File([blob], 'test.txt', { type: 'text/plain' });
  
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', 'Home/Attachments');
  formData.append('is_private', '0');
  
  try {
    const response = await fetch('http://35.159.38.76:8001/api/method/upload_file', {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
      },
      body: formData,
    });
    
    // Response'u text olarak al
    const responseText = await response.text();
    console.log('Status:', response.status);
    console.log('Response:', responseText);
    
    if (response.ok) {
      const result = JSON.parse(responseText);
      console.log('✅ Success!', result);
    } else {
      console.log('❌ Failed!');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testUpload();

