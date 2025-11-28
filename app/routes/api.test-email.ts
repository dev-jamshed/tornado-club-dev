// app/routes/api.send-real-email.ts
import { type ActionFunctionArgs, json } from "@remix-run/node";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const url = new URL(request.url);
    const email = url.searchParams.get('email') || 'jamshedgopang0001@gmail.com';
    const count = url.searchParams.get('count') || '5';

    console.log('📧 Sending REAL email to:', email);

    // ✅ ACTUAL EMAIL SEND KARO
    const result = await sendRealEmail(email, parseInt(count));

    return json({
      success: true,
      message: 'Real email sent successfully',
      email: email,
      result: result
    });

  } catch (error) {
    console.error('🔥 Email error:', error);
    return json({ 
      success: false, 
      error: 'Email failed' 
    });
  }
}

// ✅ ACTUAL EMAIL SEND FUNCTION
async function sendRealEmail(toEmail: string, referralCount: number) {
  try {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY not found in environment variables');
    }

    const emailData = {
      from: 'Tornado Club <onboarding@resend.dev>',
      to: [toEmail],
      subject: `🎉 Congratulations! ${referralCount} Referrals Completed`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
                .header { text-align: center; color: #333; }
                .congrats { color: #ff6b6b; font-size: 24px; font-weight: bold; }
                .message { color: #555; line-height: 1.6; }
                .reward { background: #fff9c4; padding: 15px; border-radius: 5px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 BADHAI HO!</h1>
                </div>
                <div class="message">
                    <p>Namaste!</p>
                    <p>Aapne <strong>${referralCount} referrals</strong> successfully complete kiye hain! 🎯</p>
                    
                    <div class="reward">
                        <h3>🏆 Aapka Reward:</h3>
                        <p>Aapko ek special gift mila hai jo aapke next order mein automatically apply ho jayega!</p>
                    </div>

                    <p>Aapke support ke liye hum bahut grateful hain! ❤️</p>
                    <p>Aage bhi refer karte rahein aur amazing rewards paate rahein!</p>
                </div>
                <br>
                <p>With love,<br>Your Tornado Club Team 💝</p>
            </div>
        </body>
        </html>
      `,
      text: `🎉 BADHAI HO!\n\nAapne ${referralCount} referrals successfully complete kiye hain!\n\nAapka Reward: Aapko ek special gift mila hai jo aapke next order mein automatically apply ho jayega!\n\nAapke support ke liye hum bahut grateful hain! ❤️\n\nWith love,\nYour Tornado Club Team 💝`
    };

    console.log('📤 Sending email via Resend...');
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData),
    });

    console.log('📨 Resend response status:', response.status);

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Email sent successfully:', data.id);
      return {
        sent: true,
        emailId: data.id,
        service: 'Resend'
      };
    } else {
      const errorData = await response.text();
      console.error('❌ Email failed:', errorData);
      return {
        sent: false,
        error: errorData
      };
    }

  } catch (error) {
    console.error('🔥 Email sending error:', error);
    return {
      sent: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function loader() {
  return json({
    message: 'Real email sending endpoint',
    usage: 'Add ?email=test@example.com&count=5 to URL',
    example: 'http://localhost:3000/api.send-real-email?email=jamshedgopang0001@gmail.com&count=5',
    note: 'Uses Resend.com for email delivery'
  });
}