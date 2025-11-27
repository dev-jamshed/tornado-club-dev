import '@shopify/ui-extensions/preact';
import { render } from "preact";
import { useState, useEffect } from "preact/hooks";

const API_BASE_URL = "https://wallet-contrast-handhelds-nearby.trycloudflare.com";
const VERIFY_REFERRAL_URL = `${API_BASE_URL}/api/verify-referral`;
const REFERRAL_PRODUCTS_URL = `${API_BASE_URL}/api/referral-products`;
const CREATE_DISCOUNT_URL = `${API_BASE_URL}/api/create-automatic-discount`;

export default async () => {
  render(<Extension />, document.body)
};

function Extension() {
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [appliedDiscountCode, setAppliedDiscountCode] = useState('');

  useEffect(() => {
    verifyAndApplyReferral();
  }, []);

  const getReferralCode = async () => {
    try {
      console.log("🔍 Getting referral code from Shopify attributes...");
      
      if (shopify.attributes && Array.isArray(shopify.attributes.current)) {
        const currentAttributes = shopify.attributes.current;
        for (let attr of currentAttributes) {
          if (attr.key === 'referral_code' && attr.value) {
            console.log("✅ Found referral_code:", attr.value);
            return attr.value;
          }
        }
      }
      return null;
    } catch (error) {
      console.error("🔥 Error getting referral code:", error);
      return null;
    }
  };

  // ✅ ORDER ATTRIBUTES MEIN REFERRAL CODE + DISCOUNT CODE ADD KARO
  const addReferralDataToAttributes = async (referralCode, discountCode) => {
    try {
      console.log("📝 Adding referral data to attributes:", { referralCode, discountCode });
      
      // ✅ Check if auto discount was applied successfully
      const discountApplied = await checkAutoDiscountApplied();
      
      if (!discountApplied) {
        console.log("❌ Auto discount not applied, skipping webhook processing");
        return;
      }

      // ✅ Referral code add karo
      if (typeof shopify.applyAttributeChange === 'function') {
        await shopify.applyAttributeChange({
          key: 'referral_code_used',
          value: referralCode,
          type: 'updateAttribute'
        });

        // ✅ Discount code add karo
        await shopify.applyAttributeChange({
          key: 'applied_discount_code',
          value: discountCode,
          type: 'updateAttribute'
        });

        console.log("✅ Referral data added to attributes for webhook");
      }
    } catch (error) {
      console.error("🔥 Error adding referral data to attributes:", error);
    }
  };

  // ✅ CHECK IF AUTO DISCOUNT WAS APPLIED SUCCESSFULLY
  const checkAutoDiscountApplied = async () => {
    try {
      console.log("🔍 Checking if auto discount was applied...");
      
      if (shopify.discountCodes && Array.isArray(shopify.discountCodes.current)) {
        const currentDiscounts = shopify.discountCodes.current;
        const hasAppliedDiscount = currentDiscounts.length > 0;
        console.log("✅ Auto discount applied status:", hasAppliedDiscount);
        return hasAppliedDiscount;
      }
      return false;
    } catch (error) {
      console.error("🔥 Error checking discount application:", error);
      return false;
    }
  };

  const verifyAndApplyReferral = async () => {
    try {
      console.log("🔍 Starting referral verification...");

      const code = await getReferralCode();
      if (!code) {
        console.log("❌ No referral code found");
        setStatus('no_referral');
        return;
      }

      setReferralCode(code);
      console.log("🎯 Using referral code:", code);
      await removeExistingDiscounts();

      // ✅ STEP 1: Verify referral code
      const verifyResponse = await fetch(VERIFY_REFERRAL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralCode: code })
      });

      const verifyData = await verifyResponse.json();
      console.log("📦 Verification API result:", verifyData);

      if (verifyData.success && verifyData.isValid) {
        console.log("✅ Valid referral - now getting free products...");
        
        // ✅ STEP 2: Get free products
        const productsResponse = await fetch(REFERRAL_PRODUCTS_URL);
        const productsData = await productsResponse.json();

        if (productsData.success && productsData.data.fixedRefereeProducts) {
          console.log("🎁 Free products received:", productsData.data.fixedRefereeProducts);
          
          // ✅ STEP 3: Create automatic discount using Remix API
          await createAndApplyAutomaticDiscount(code, productsData.data.fixedRefereeProducts[0]);
        } else {
          setStatus('no_products');
          setMessage("No free products available for this referral");
        }
      } else {
        setStatus('invalid');
        setMessage(verifyData.message || 'Invalid referral code');
      }

    } catch (error) {
      console.error("🔥 Verification error:", error);
      setStatus('error');
      setMessage('Verification failed');
    }
  };

  const createAndApplyAutomaticDiscount = async (code, productGid) => {
    try {
      console.log("🎫 Creating automatic discount via Remix API...");

      const productId = productGid.replace('gid://shopify/Product/', '');
      console.log("📦 Product ID for discount:", productId);

      const discountResponse = await fetch(CREATE_DISCOUNT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referralCode: code,
          productId: productId
        })
      });

      if (!discountResponse.ok) {
        const errorText = await discountResponse.text();
        console.error("🔥 API Response error:", discountResponse.status, errorText);
        throw new Error(`API error: ${discountResponse.status}`);
      }

      const discountData = await discountResponse.json();
      console.log("💰 Discount creation result:", discountData);

      if (discountData.success) {
        const discountCode = discountData.discountCode;
        console.log("✅ Automatic discount created:", discountCode);
        
        // ✅ Apply the discount code
        await shopify.applyDiscountCodeChange({
          type: 'addDiscountCode',
          code: discountCode
        });

        console.log("✅ Discount code applied successfully");
        
        // ✅ Discount code state mein save karo
        setAppliedDiscountCode(discountCode);
        
        // ✅ REFERRAL CODE + DISCOUNT CODE ATTRIBUTES MEIN ADD KARO (Webhook ke liye)
        await addReferralDataToAttributes(code, discountCode);
        
        setStatus('applied');
        setMessage(`🎉 Free product added with 100% discount!`);
        
      } else {
        console.log("❌ Discount creation failed:", discountData.error);
        setStatus('error');
        setMessage('Discount creation failed. Please try again.');
      }

    } catch (error) {
      console.error("🔥 Automatic discount error:", error);
      setStatus('error');
      setMessage('Discount application failed. Please try again.');
    }
  };

  // ✅ EXISTING DISCOUNTS REMOVE KARNE KA FUNCTION
  const removeExistingDiscounts = async () => {
    try {
      console.log("🗑️ Removing existing discounts...");
      
      if (shopify.discountCodes && Array.isArray(shopify.discountCodes.current)) {
        const currentDiscounts = shopify.discountCodes.current;
        console.log("🎫 Current discounts to remove:", currentDiscounts);
        
        for (let discount of currentDiscounts) {
          try {
            await shopify.applyDiscountCodeChange({
              type: 'removeDiscountCode',
              code: discount.code
            });
            console.log(`✅ Removed discount: ${discount.code}`);
          } catch (removeError) {
            console.log(`⚠️ Could not remove discount: ${discount.code}`, removeError.message);
          }
        }
      } else {
        console.log("ℹ️ No existing discounts found");
      }
      
    } catch (error) {
      console.error("🔥 Remove discounts error:", error);
    }
  };

  // UI rendering
  const getBannerContent = () => {
    switch (status) {
      case 'applied':
        return (
          <s-banner heading="🎉 Referral Applied!" tone="success">
            <s-stack gap="base">
              <s-text>{message}</s-text>
              <s-text>Your free product discount has been automatically applied!</s-text>
              <s-text>Discount code: {appliedDiscountCode}</s-text>
              <s-text>Referral code will be processed after order completion.</s-text>
            </s-stack>
          </s-banner>
        );
      case 'invalid':
        return (
          <s-banner heading="❌ Invalid Referral" tone="critical">
            <s-text>{message}</s-text>
          </s-banner>
        );
      case 'no_products':
        return (
          <s-banner heading="📦 No Products Available" tone="warning">
            <s-text>{message}</s-text>
          </s-banner>
        );
      case 'error':
        return (
          <s-banner heading="⚠️ System Error" tone="critical">
            <s-text>{message}</s-text>
          </s-banner>
        );
      case 'no_referral':
        return null;
      case 'loading':
        return (
          <s-banner heading="⏳ Processing Referral..." tone="info">
            <s-stack gap="base">
              <s-text>Applying your referral benefits...</s-text>
              <s-text>Please wait while we set up your free product discount.</s-text>
            </s-stack>
          </s-banner>
        );
      default:
        return null;
    }
  };

  return getBannerContent();
}