const express = require('express');
const firebaseDb = require('../connections/firebase_admin');
const router = express.Router();

require('dotenv').config();

const productsPath = '/products/';
const productsRef = firebaseDb.ref(productsPath);

const couponsPath = '/coupons/';
const couponsRef = firebaseDb.ref(couponsPath);

const cartsPath = '/carts/';
const cartsRef = firebaseDb.ref(cartsPath);

const ordersPath = '/orders/';
const ordersRef = firebaseDb.ref(ordersPath);

// jwt
const jwt = require('jsonwebtoken');
const SECRET_KEY = 'your-secret-key';

// 取得產品
router.get('/products', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 5; // 默認每頁5
  try {
    // 計算起始項的位置
    const startAt = (page - 1) * pageSize;
    // 獲取總產品數用於計算總頁數
    const totalSnapshot = await productsRef.once('value');
    const totalProducts = totalSnapshot.numChildren();
    const totalPages = Math.ceil(totalProducts / pageSize);
    // 獲取當前頁的產品
    const snapshot = await productsRef
        .orderByKey()
        .limitToFirst(startAt + pageSize) // 先取到前N個數據
        .once('value');

    const productsArray = Object.values(snapshot.val() || {});
    const products = productsArray.slice(startAt, startAt + pageSize);

    if (products) {
      const response = {
        success: true,
        products: products,
        pagination: {
          total_pages: totalPages,
          current_page: page,
          has_pre: page > 1,
          has_next: page < totalPages,
          category: ""
        },
        message: []
      };
      res.status(200).send(response);
    } else {
      res.status(404).json({ success: false, message: ["No beverages found"] });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: ["Error fetching beverages", error.message] });
  }
});


// 取得單一筆產品
router.get('/product/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // 從 Firebase 資料庫取得特定產品
    const productSnapshot = await productsRef.child(id).once('value');
    const productData = productSnapshot.val();
    // 判斷產品是否存在
    if (productData) {
      const response = {
        success: true,
        product: {
          category: productData.category,
          content: productData.content,
          description: productData.description,
          id: productData.id,
          imageUrl: productData.imageUrl,
          imagesUrl: productData.imagesUrl || [], // 默认空数组防止没有值时出错
          is_enabled: productData.is_enabled,
          origin_price: productData.origin_price,
          price: productData.price,
          title: productData.title,
          unit: productData.unit
        }
      };
      res.status(200).json(response);
    } else {
      res.status(404).json({ success: false, message: ["Product not found"] });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: ["Error fetching product", error.message] });
  }
});


// 取得購物車
router.get('/cart', async (req, res) => {
  try {
    const snapshot = await cartsRef.once('value'); // 獲取資料
    const carts = snapshot.val() || {};
    const cartItems = Object.keys(carts).map(key => ({
      ...carts[key],
      id: key, // 添加 id 屬性
      final_total: carts[key].total
    }));

    const final_total = cartItems.reduce((acc, cart) => acc + cart.total, 0); // 計算最終總金額

    res.json({
      data: {
        carts: cartItems,
        final_total: final_total,
        total: final_total
      },
      success: true
    });
  } catch (error) {
    console.error("error@@",error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});


// 加入購物車
router.post('/cart', async (req, res) => {
  const { product_id, qty } = req.body.data; // 解構獲取 payload

  if (!product_id || !qty) {
    return res.status(400).json({ error: 'Product ID and quantity are required.' });
  }

  try {
    // 取得產品資料
    const productSnapshot = await firebaseDb.ref(`/products/${product_id}`).once('value');
    const product = productSnapshot.val();
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    // 計算總價
    const total = product.price * qty;

    // 準備要加入購物車的資料
    const cartItem = {
      product_id,
      qty,
      total,
      product: {
        ...product, // 將產品資訊放入
      }
    };

    // 將商品加入購物車
    const newCartRef = cartsRef.push(); // 在 carts 中創建新項目
    await newCartRef.set(cartItem);

    // 準備響應資料
    res.json({
      data: {
        ...cartItem,
        id: newCartRef.key, // 返回新項目的 ID
        final_total: total,
      },
      message: "已加入購物車",
      success: true,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});


// 編輯購物車
router.put('/cart/:id', async (req, res) => {
  const { id } = req.params; // 取得購物車項目的 ID
  const { product_id, qty } = req.body.data; // 解構獲取 payload

  if (!product_id || !qty) {
    return res.status(400).json({ error: 'Product ID and quantity are required.' });
  }

  try {
    // 取得產品資料
    const productSnapshot = await firebaseDb.ref(`/products/${product_id}`).once('value');
    const product = productSnapshot.val();

    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    // 計算新的總價
    const total = product.price * qty;

    // 準備要更新的購物車項目資料
    const updatedCartItem = {
      product_id,
      qty,
      total,
      product: {
        ...product, // 將產品資訊放入
      }
    };

    // 更新購物車中的特定項目
    const cartRef = cartsRef.child(id); // 獲取特定購物車項目的參考路徑
    const cartSnapshot = await cartRef.once('value');

    if (!cartSnapshot.exists()) {
      return res.status(404).json({ error: 'Cart item not found.' });
    }

    await cartRef.update(updatedCartItem); // 更新購物車項目

    res.json({
      data: {
        product_id,
        qty
      },
      success: true,
      message: "已更新購物車"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});


// 刪除購物車
router.delete('/cart/:id', async (req, res) => {
  const { id } = req.params; // 取得購物車項目的 ID

  try {
    const cartRef = cartsRef.child(id); // 獲取特定購物車項目的參考路徑
    const cartSnapshot = await cartRef.once('value');
    if (!cartSnapshot.exists()) {
      return res.status(404).json({ error: 'Cart item not found.' });
    }

    // 刪除購物車中的特定項目
    await cartRef.remove();

    // 返回成功響應
    res.json({
      success: true,
      message: "已刪除"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});


// 登入頁面
router.post('/signin', (req, res) => {

  // 用來簽名 token 的密鑰，應該保密
  // 模擬的使用者資料，通常這些會來自資料庫
  const mockUser = {
    username: 'a2323179090@gmail.com',
    password: process.env.ADMIN_PASSWORD,
    uid: 'VijpV86RhwXoIshpKTxoSg5mVoq2',
  };
  // 簽名 token 的過期時間 (例如 24 小時)
  const TOKEN_EXPIRES_IN = '24h';

  const { username, password } = req.body;

  // 驗證使用者的 username 和 password
  if (username === mockUser.username && password === mockUser.password) {
    // 使用 uid 生成 token
    const token = jwt.sign({ uid: mockUser.uid, email: mockUser.username }, SECRET_KEY, {
      expiresIn: TOKEN_EXPIRES_IN,
    });

    // 計算 token 的過期時間
    const decodedToken = jwt.decode(token);

    res.json({
      success: true,
      message: "登入成功",
      uid: mockUser.uid,
      token: token,
      expired: decodedToken.exp * 1000 // 以毫秒計算的過期時間
    });
  } else {
    res.status(401).json({
      success: false,
      message: "帳號或密碼錯誤"
    });
  }
});

// ----------以下需要token-----------------

// 取得後台產品
router.get('/admin/products', async (req, res) => {

  // 取得 authorization header
  const authHeader = req.headers.authorization;

  // 判斷是否有token
  if (!authHeader) {
    return res.status(401).json({ success: false, message: ["未授權"] });
  }

  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 5; // 默認每頁5

  try {
    // 判斷token是否正確
    const decodedToken = jwt.verify(authHeader, SECRET_KEY);

    // 計算起始項的位置
    const startAt = (page - 1) * pageSize;

    // 獲取總產品數用於計算總頁數
    const totalSnapshot = await productsRef.once('value');
    const totalProducts = totalSnapshot.numChildren();
    const totalPages = Math.ceil(totalProducts / pageSize);
    // 獲取當前頁的產品
    const snapshot = await productsRef
        .orderByKey()
        .limitToFirst(startAt + pageSize) // 先取到前N個數據
        .once('value');

    const productsArray = Object.values(snapshot.val() || {});
    const products = productsArray.slice(startAt, startAt + pageSize);

    if (products) {
      const response = {
        success: true,
        products: products,
        pagination: {
          total_pages: totalPages,
          current_page: page,
          has_pre: page > 1,
          has_next: page < totalPages,
          category: ""
        },
        message: []
      };

      res.status(200).send(response);
    } else {
      res.status(404).json({ success: false, message: ["No beverages found"] });
    }
  } catch (error) {
    res.status(500).json({ success: false, messages: ["Error fetching beverages", error.message] });
  }
});


// 新增後台產品
router.post('/admin/product', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: ["未授權"] });
  }

  try {
    const decodedToken = jwt.verify(authHeader, SECRET_KEY);
    const productData = req.body.data;

    if (!productData.category || !productData.content || !productData.description || !productData.title || !productData.unit) {
      return res.status(400).json({ success: false, message: ["所有都必須填寫喔"] });
    }

    // 檢查 imageUrl 或上傳的圖片是否存在
    if (!productData.imageUrl && (!req.file || !req.files)) {
      return res.status(400).json({ success: false, message: ["請上傳圖片或提供圖片網址"] });
    }

    const newProductRef = productsRef.push();
    await newProductRef.set({
      ...productData,
      id: newProductRef.key
    });

    res.status(201).json({ success: true, message: ["Product created successfully"] });
  } catch (error) {
    res.status(500).json({ success: false, message: ["Error creating product", error.message] });
  }
});


// 編輯產品
router.put('/admin/product/:id', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: ["Unauthorized: No token provided"] });
  }

  try {
    const decodedToken = jwt.verify(authHeader, SECRET_KEY);
    const productData = req.body.data;
    const productId = req.params.id;

    if (!productData.title || !productData.price || !productData.unit || !productData.imageUrl) {
      return res.status(400).json({ success: false, message: ["Missing required product fields"] });
    }

    const productRef = productsRef.child(productId);

    await productRef.update(productData);

    res.status(200).json({ success: true, message: ["Product updated successfully"] });
  } catch (error) {
    res.status(500).json({ success: false, message: ["Error updating product", error.message] });
  }
});


// 刪除產品
router.delete('/admin/product/:id', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: "Unauthorized: No token provided" });
  }

  try {
    const decodedToken = jwt.verify(authHeader, SECRET_KEY);
    const productId = req.params.id;

    const productRef = productsRef.child(productId);

    // 檢查產品是否存在
    const productSnapshot = await productRef.once('value');

    if (!productSnapshot.exists()) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    await productRef.remove();

    res.status(200).json({ success: true, message: "已刪除產品" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting product", error: error.message });
  }
});


// 取得後台優惠券
router.get('/admin/coupons', async (req, res) => {

  // 取得 authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ success: false, message: ["未授權"] });
  }

  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 5; // 默認每頁5

  try {
    const decodedToken = jwt.verify(authHeader, SECRET_KEY);

    // 計算起始項的位置
    const startAt = (page - 1) * pageSize;

    // 獲取總產品數用於計算總頁數
    const totalSnapshot = await couponsRef.once('value');
    const totalCoupons = totalSnapshot.numChildren();
    const totalPages = Math.ceil(totalCoupons / pageSize);
    // 獲取當前頁的產品
    const snapshot = await couponsRef
        .orderByKey()
        .limitToFirst(startAt + pageSize) // 先取到前N個數據
        .once('value');

    const couponsArray = Object.values(snapshot.val() || {});
    const coupons = couponsArray.slice(startAt, startAt + pageSize);

    if (coupons) {
      const response = {
        success: true,
        coupons: coupons,
        pagination: {
          total_pages: totalPages,
          current_page: page,
          has_pre: page > 1,
          has_next: page < totalPages,
          category: ""
        },
        message: []
      };

      res.status(200).send(response);
    } else {
      res.status(404).json({ success: false, message: ["No coupons found"] });
    }
  } catch (error) {
    res.status(500).json({ success: false, messages: ["Error fetching coupons", error.message] });
  }
});


// 建立優惠券
router.post('/admin/coupon', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: ["未授權"] });
  }

  try {
    const decodedToken = jwt.verify(authHeader, SECRET_KEY);
    const couponData = req.body.data;

    if (!couponData.title || !couponData.percent || !couponData.due_date || !couponData.code || !couponData.is_enabled ) {
      return res.status(400).json({ success: false, message: ["所有都必須填寫喔"] });
    }

    const newCouponRef = couponsRef.push();
    await newCouponRef.set({
      ...couponData,
      id: newCouponRef.key
    });

    res.status(201).json({ success: true, message: ["Coupon created successfully"] });
  } catch (error) {
    res.status(500).json({ success: false, message: ["Error creating coupon", error.message] });
  }
});


// 編輯優惠券
router.put('/admin/coupon/:id', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: ["Unauthorized: No token provided"] });
  }

  try {
    const decodedToken = jwt.verify(authHeader, SECRET_KEY);
    const couponData = req.body.data;
    const couponId = req.params.id;

    if (!couponData.title || !couponData.percent || !couponData.due_date || !couponData.code || !couponData.is_enabled ) {
      return res.status(400).json({ success: false, message: ["所有都必須填寫喔"] });
    }

    const couponRef = couponsRef.child(couponId);
    await couponRef.update(couponData);

    res.status(200).json({ success: true, message: ["Product updated successfully"] });
  } catch (error) {
    res.status(500).json({ success: false, message: ["Error updating product", error.message] });
  }
});


// 刪除優惠券
router.delete('/admin/coupon/:id', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: "Unauthorized: No token provided" });
  }

  try {
    const decodedToken = jwt.verify(authHeader, SECRET_KEY);
    const couponId = req.params.id;

    const couponRef = couponsRef.child(couponId);

    // 检查优惠券是否存在
    const couponSnapshot = await couponRef.once('value');

    if (!couponSnapshot.exists()) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }

    await couponRef.remove();

    res.status(200).json({ success: true, message: "已刪除優惠券" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting coupon", error: error.message });
  }
});


// 取得後台訂單
router.get('/admin/orders', async (req, res) => {
  // 取得 authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ success: false, message: ["未授權"] });
  }

  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 5; // 默認每頁5

  try {
    const decodedToken = jwt.verify(authHeader, SECRET_KEY);

    // 計算起始項的位置
    const startAt = (page - 1) * pageSize;

    // 獲取總訂單數用於計算總頁數
    const totalSnapshot = await ordersRef.once('value'); // ordersRef 是對應的 Firebase 引用
    const totalOrders = totalSnapshot.numChildren();
    const totalPages = Math.ceil(totalOrders / pageSize);

    // 獲取當前頁的訂單
    const snapshot = await ordersRef
        .orderByKey()
        .limitToFirst(startAt + pageSize) // 先取到前N個數據
        .once('value');

    const ordersArray = Object.values(snapshot.val() || {});
    const orders = ordersArray.slice(startAt, startAt + pageSize);

    if (orders) {
      const response = {
        success: true,
        orders: orders,
        pagination: {
          total_pages: totalPages,
          current_page: page,
          has_pre: page > 1,
          has_next: page < totalPages,
          category: ""
        },
        message: []
      };

      res.status(200).send(response);
    } else {
      res.status(404).json({ success: false, message: ["No orders found"] });
    }
  } catch (error) {
    res.status(500).json({ success: false, messages: ["Error fetching orders", error.message] });
  }
});


// 新增訂單
router.post('/order', async (req, res) => {
  const { user } = req.body.data;

  // 檢查請求的有效性
  if (!user || !user.name || !user.tel || !user.email || !user.address) {
    return res.status(400).json({ success: false, message: "請提供完整的用戶資訊" });
  }

  const snapshot = await cartsRef.once('value'); // 獲取資料
  const carts = snapshot.val();

  if (!carts || Object.keys(carts).length === 0) {
    return res.status(400).json({ success: false, message: "購物車為空" });
  }

  try {
    const cartsArray = Object.values(carts);
    const total = cartsArray.reduce((sum, cartItem) => {
      // 確保 cartItem.total 是有效的數字
      const itemTotal = Number(cartItem.total); // 將其轉換為數字
      if (isNaN(itemTotal)) {
        console.error("Invalid total for cart item:", cartItem);
        return sum; // 如果無效，則不加到總和中
      }
      return sum + itemTotal; // 累加有效的 total
    }, 0); // 初始值為 0

    // 檢查 total 是否有效
    if (isNaN(total)) {
      return res.status(400).json({ success: false, message: "計算總金額時發生錯誤" });
    }

    // 構建產品列表
    const products = {};
    cartsArray.forEach(cartItem => {
      // 確保 cartItem 有效且包含 product 屬性
      if (cartItem && cartItem.product && cartItem.product_id) {
        products[cartItem.product_id] = { // 使用 product_id 作為鍵
          final_total: cartItem.total,
          id: cartItem.product_id, // 使用 product_id
          product: cartItem.product, // 直接從 cartItem 中獲取產品資訊
          qty: cartItem.qty,
          total: cartItem.total
        };
      } else {
        console.error("無效的購物車項目:", cartItem);
      }
    });


    // 新增訂單至 Firebase
    const newOrderRef = ordersRef.push(); // 創建一個新的訂單參考
    const orderData = {
      user,
      id: newOrderRef.key,
      create_at: Date.now(), // 當前時間戳
      total: total, // 這裡的 total 可以根據實際情況來計算
      products, // 加入產品列表
      is_paid: false // 設置未付款
    };

    await newOrderRef.set(orderData); // 儲存訂單數據

    await cartsRef.set({});

    res.status(201).json({
      success: true,
      message: "已建立訂單",
      total: orderData.total,
      orderId: newOrderRef.key,
      create_at: orderData.create_at
    });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ success: false, message: "無法建立訂單" });
  }
});


//  取得單一筆訂單
router.get('/order/:orderId', async (req, res) => {
  const { orderId } = req.params;

  try {
    // 從 Firebase 資料庫中檢索指定的訂單
    const orderSnapshot = await ordersRef.child(orderId).once('value');
    const orderData = orderSnapshot.val();

    // 如果訂單不存在
    if (!orderData) {
      return res.status(404).json({
        success: false,
        message: "訂單不存在"
      });
    }

    // 構造響應數據結構
    const response = {
      success: true,
      order: {
        id: orderId,
        create_at: orderData.create_at,
        is_paid: orderData.is_paid || false,
        products: orderData.products || {},
        total: orderData.total,
        user: orderData.user
      }
    };

    // 返回訂單詳情
    res.status(200).json(response);

  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(500).json({
      success: false,
      message: "無法檢索訂單",
      error: error.message
    });
  }
});

module.exports = router;
