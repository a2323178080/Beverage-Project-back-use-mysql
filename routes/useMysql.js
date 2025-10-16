const express = require('express');
const db = require('../config/db'); // 引入 MySQL 連線池
const router = express.Router();
const jwt = require('jsonwebtoken');

require('dotenv').config();

const SECRET_KEY = 'your-secret-key';

// 取得產品
router.get('/products', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 5; // 默認每頁5
    const offset = (page - 1) * pageSize;

    try {
        // 獲取產品資料
        const [products] = await db.query('SELECT * FROM products LIMIT ? OFFSET ?', [pageSize, offset]);
        const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM products');
        const totalPages = Math.ceil(total / pageSize);

        // 處理產品資料
        const productsArray = Object.values(products || {});
        const paginatedProducts = productsArray.slice(0, pageSize);

        if (paginatedProducts.length > 0) {
            res.status(200).json({
                success: true,
                products: paginatedProducts,
                pagination: {
                    total_pages: totalPages,
                    current_page: page,
                    has_pre: page > 1,
                    has_next: page < totalPages,
                    category: ""
                },
                message: []
            });
        } else {
            res.status(404).json({ success: false, message: ["No products found"] });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: ["Error fetching products", error.message] });
    }
});

// 取得單一筆產品
router.get('/product/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // 從 MySQL 資料庫取得特定產品
        const [[productData]] = await db.query('SELECT * FROM products WHERE id = ?', [id]);

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
                    imagesUrl: productData.imagesUrl ? JSON.parse(productData.imagesUrl) : [], // 假設 imagesUrl 是 JSON 格式
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
        // 使用 JOIN 查詢來獲取購物車項目和對應的產品資訊
        const [cartItems] = await db.query(`
            SELECT 
                c.id as cart_id,
                c.product_id,
                c.qty,
                c.total,
                p.category,
                p.content,
                p.description,
                p.id as product_original_id,
                p.imageUrl,
                p.is_enabled,
                p.origin_price,
                p.price,
                p.title,
                p.unit
            FROM carts c 
            LEFT JOIN products p ON c.product_id = p.id
        `);
        
        // 如果購物車為空，返回空資料
        if (cartItems.length === 0) {
            return res.json({
                data: {
                    carts: [],
                    final_total: 0,
                    total: 0
                },
                success: true
            });
        }
        
        // 格式化資料以符合前端要求的格式
        const carts = cartItems.map(item => ({
            product: {
                category: item.category,
                content: item.content,
                description: item.description,
                id: item.product_id,
                imageUrl: item.imageUrl,
                imagesUrl: ["", "", "", "", ""],
                is_enabled: item.is_enabled,
                num: 10,
                origin_price: parseFloat(item.origin_price || 0),
                price: parseFloat(item.price || 0),
                title: item.title,
                unit: item.unit
            },
            product_id: item.product_id,
            qty: parseInt(item.qty || 0),
            total: parseFloat(item.total || 0),
            id: item.cart_id,
            final_total: parseFloat(item.total || 0)
        }));

        // 計算最終總金額
        const final_total = carts.reduce((acc, cart) => acc + cart.total, 0);

        res.json({
            data: {
                carts: carts,
                final_total: final_total,
                total: final_total
            },
            success: true
        });
    } catch (error) {
        console.error("購物車查詢錯誤:", error);
        res.status(500).json({ 
            error: 'Internal server error.',
            message: error.message,
            success: false
        });
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
        const [[product]] = await db.query('SELECT * FROM products WHERE id = ?', [product_id]);
        
        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        // 計算總價
        const total = product.price * qty;

        // 準備要加入購物車的資料
        const cartItem = {
            product_id,
            qty,
            total
        };

        // 將商品加入購物車 MySQL
        const [result] = await db.query(
            'INSERT INTO carts (product_id, qty, total) VALUES (?, ?, ?)',
            [product_id, qty, total]
        );

        // 準備響應資料
        res.json({
            data: {
                ...cartItem,
                id: result.insertId, // 返回新項目的 ID
                final_total: total,
                product: {
                    category: product.category,
                    content: product.content,
                    description: product.description,
                    id: product.id,
                    imageUrl: product.imageUrl,
                    imagesUrl: product.imagesUrl ? JSON.parse(product.imagesUrl) : ["", "", "", "", ""],
                    is_enabled: product.is_enabled,
                    num: 10,
                    origin_price: product.origin_price,
                    price: product.price,
                    title: product.title,
                    unit: product.unit
                }
            },
            message: "已加入購物車",
            success: true,
        });
    } catch (error) {
        console.error("加入購物車錯誤:", error);
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
        const [[product]] = await db.query('SELECT * FROM products WHERE id = ?', [product_id]);
        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }

        // 計算新的總價
        const total = product.price * qty;

        // 更新購物車中的特定項目
        const [result] = await db.query(
            'UPDATE carts SET product_id = ?, qty = ?, total = ? WHERE id = ?',
            [product_id, qty, total, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Cart item not found.' });
        }

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
        // 獲取特定購物車項目
        const [cartItem] = await db.query('SELECT * FROM carts WHERE id = ?', [id]);
        if (cartItem.length === 0) {
            return res.status(404).json({ error: 'Cart item not found.' });
        }

        // 刪除購物車中的特定項目
        await db.query('DELETE FROM carts WHERE id = ?', [id]);

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
    const authHeader = req.headers.authorization;

    // 判斷是否有token
    if (!authHeader) {
        return res.status(401).json({ success: false, message: ["未授權"] });
    }

    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 5; // 默認每頁5
    const offset = (page - 1) * pageSize;

    try {
        // 判斷token是否正確
        const decodedToken = jwt.verify(authHeader, SECRET_KEY);

        // 獲取總產品數用於計算總頁數
        const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM products');
        const totalPages = Math.ceil(total / pageSize);

        // 獲取當前頁的產品
        const [products] = await db.query('SELECT * FROM products LIMIT ? OFFSET ?', [pageSize, offset]);

        if (products.length > 0) {
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
            res.status(404).json({ success: false, message: ["No products found"] });
        }
    } catch (error) {
        res.status(500).json({ success: false, messages: ["Error fetching products", error.message] });
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

        let imageUrl = productData.imageUrl;

        // 確保所有文字欄位不會太長
        const truncateString = (str, maxLength) => {
            if (!str) return str;
            return str.length > maxLength ? str.substring(0, maxLength) : str;
        };

        const safeProductData = {
            category: truncateString(productData.category, 100),
            content: truncateString(productData.content, 1000),
            description: truncateString(productData.description, 500),
            title: truncateString(productData.title, 200),
            unit: truncateString(productData.unit, 50),
            imageUrl: imageUrl,
            origin_price: productData.origin_price || 0,
            price: productData.price || 0,
            is_enabled: productData.is_enabled || false,
            num: productData.num || 10 // 預設值為 10
        };

        // 生成唯一的產品 ID
        const productId = 'product_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        // 插入產品資料到 MySQL
        const [result] = await db.query(
            'INSERT INTO products (id, category, content, description, title, unit, imageUrl, origin_price, price, is_enabled, num) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                productId,
                safeProductData.category,
                safeProductData.content,
                safeProductData.description,
                safeProductData.title,
                safeProductData.unit,
                safeProductData.imageUrl,
                safeProductData.origin_price,
                safeProductData.price,
                safeProductData.is_enabled,
                safeProductData.num
            ]
        );

        res.status(201).json({ 
            success: true, 
            message: ["Product created successfully"], 
            productId: productId 
        });
    } catch (error) {
        console.error("資料庫錯誤:", error);
        // 提供更詳細的錯誤資訊
        let errorMessage = "Error creating product";
        if (error.code === 'ER_DATA_TOO_LONG') {
            errorMessage = `資料太長: ${error.message}`;
        } else if (error.code === 'ER_DUP_ENTRY') {
            errorMessage = `重複的 ID: ${error.message}`;
        }
        res.status(500).json({ success: false, message: [errorMessage, error.message] });
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

        // 更新產品資料到 MySQL
        const [result] = await db.query(
            'UPDATE products SET title = ?, price = ?, unit = ?, imageUrl = ?, category = ?, content = ?, description = ?, origin_price = ?, is_enabled = ? WHERE id = ?',
            [
                productData.title,
                productData.price,
                productData.unit,
                productData.imageUrl,
                productData.category || null,
                productData.content || null,
                productData.description || null,
                productData.origin_price || 0,
                productData.is_enabled || false,
                productId
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: ["Product not found"] });
        }

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

        // 檢查產品是否存在
        const [[product]] = await db.query('SELECT * FROM products WHERE id = ?', [productId]);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        // 刪除產品
        const [result] = await db.query('DELETE FROM products WHERE id = ?', [productId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        res.status(200).json({ success: true, message: "已刪除產品" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error deleting product", error: error.message });
    }
});

// 取得後台優惠券
router.get('/admin/coupons', async (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ success: false, message: ["未授權"] });
    }

    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 5; // 默認每頁5
    const offset = (page - 1) * pageSize;

    try {
        // 驗證 token
        const decodedToken = jwt.verify(authHeader, SECRET_KEY);

        // 獲取總優惠券數用於計算總頁數
        const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM coupons');
        const totalPages = Math.ceil(total / pageSize);

        // 獲取當前頁的優惠券
        const [coupons] = await db.query('SELECT * FROM coupons LIMIT ? OFFSET ?', [pageSize, offset]);

        if (coupons.length > 0) {
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

        if (!couponData.title || !couponData.percent || !couponData.due_date || !couponData.code || couponData.is_enabled === undefined) {
            return res.status(400).json({ success: false, message: ["所有都必須填寫喔"] });
        }

        // 確保資料欄位長度不超過限制
        const truncateString = (str, maxLength) => {
            if (!str) return str;
            return str.length > maxLength ? str.substring(0, maxLength) : str;
        };

        const safeCouponData = {
            title: truncateString(couponData.title, 200),
            percent: couponData.percent,
            due_date: couponData.due_date,
            code: truncateString(couponData.code, 50),
            is_enabled: couponData.is_enabled
        };

        // 生成唯一的優惠券 ID
        const couponId = 'coupon_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        // 插入優惠券資料到 MySQL
        const insertQuery = 'INSERT INTO coupons (id, code, title, percent, due_date, is_enabled) VALUES (?, ?, ?, ?, ?, ?)';
        const insertValues = [
            couponId,
            safeCouponData.code,
            safeCouponData.title,
            parseInt(safeCouponData.percent),
            parseInt(safeCouponData.due_date),
            safeCouponData.is_enabled ? 1 : 0
        ];
        
        const [result] = await db.query(insertQuery, insertValues);

        res.status(201).json({ 
            success: true, 
            message: ["Coupon created successfully"],
            couponId: couponId
        });
    } catch (error) {
        console.error("資料庫錯誤:", error);
        // 提供更詳細的錯誤資訊
        let errorMessage = "Error creating coupon";
        if (error.code === 'ER_DATA_TOO_LONG') {
            errorMessage = `資料太長: ${error.message}`;
        } else if (error.code === 'ER_DUP_ENTRY') {
            errorMessage = `重複的代碼: ${error.message}`;
        }
        res.status(500).json({ success: false, message: [errorMessage, error.message] });
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

        if (!couponData.title || !couponData.percent || !couponData.due_date || !couponData.code || couponData.is_enabled === undefined) {
            return res.status(400).json({ success: false, message: ["所有都必須填寫喔"] });
        }

        // 更新優惠券資料到 MySQL
        const [result] = await db.query(
            'UPDATE coupons SET title = ?, percent = ?, due_date = ?, code = ?, is_enabled = ? WHERE id = ?',
            [
                couponData.title,
                couponData.percent,
                couponData.due_date,
                couponData.code,
                couponData.is_enabled,
                couponId
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: ["Coupon not found"] });
        }

        res.status(200).json({ success: true, message: ["Coupon updated successfully"] });
    } catch (error) {
        res.status(500).json({ success: false, message: ["Error updating coupon", error.message] });
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

        // 檢查優惠券是否存在
        const [[coupon]] = await db.query('SELECT * FROM coupons WHERE id = ?', [couponId]);
        if (!coupon) {
            return res.status(404).json({ success: false, message: "Coupon not found" });
        }

        // 刪除優惠券
        const [result] = await db.query('DELETE FROM coupons WHERE id = ?', [couponId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Coupon not found" });
        }

        res.status(200).json({ success: true, message: "已刪除優惠券" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error deleting coupon", error: error.message });
    }
});

// 取得後台訂單
router.get('/admin/orders', async (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ success: false, message: ["未授權"] });
    }

    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 5; // 默認每頁5

    try {
        // 驗證 token
        const decodedToken = jwt.verify(authHeader, SECRET_KEY);

        // 先獲取不重複的訂單ID總數用於計算總頁數
        const [[{ total }]] = await db.query('SELECT COUNT(DISTINCT id) AS total FROM orders');
        const totalPages = Math.ceil(total / pageSize);
        
        // 獲取不重複的訂單ID，依照創建時間排序和分頁
        const [distinctOrders] = await db.query(`
            SELECT DISTINCT id, create_at 
            FROM orders 
            ORDER BY create_at DESC 
            LIMIT ? OFFSET ?
        `, [pageSize, (page - 1) * pageSize]);

        if (distinctOrders.length === 0) {
            return res.status(404).json({ success: false, message: ["No orders found"] });
        }

        // 取得這些訂單ID的詳細資料
        const orderIds = distinctOrders.map(order => order.id);
        const placeholders = orderIds.map(() => '?').join(',');
        
        const [orders] = await db.query(`
            SELECT 
                o.id,
                o.user_id,
                o.product_id,
                o.qty,
                o.total,
                o.final_total,
                o.is_paid,
                o.create_at,
                u.name as user_name,
                u.email as user_email,
                u.tel as user_tel,
                u.address as user_address,
                p.id as product_original_id,
                p.category,
                p.content,
                p.description,
                p.title,
                p.unit,
                p.imageUrl,
                p.origin_price,
                p.price,
                p.is_enabled,
                p.num
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN products p ON o.product_id = p.id
            WHERE o.id IN (${placeholders})
            ORDER BY o.create_at DESC, o.id
        `, orderIds);

        // 按訂單 ID 分組處理資料
        const ordersMap = {};
        
        orders.forEach(order => {
            if (!ordersMap[order.id]) {
                ordersMap[order.id] = {
                    id: order.id,
                    create_at: order.create_at,
                    is_paid: Boolean(order.is_paid),
                    total: 0, // 會在後面計算
                    user: {
                        name: order.user_name,
                        email: order.user_email,
                        tel: order.user_tel,
                        address: order.user_address
                    },
                    products: {}
                };
            }

            // 添加產品資訊
            if (order.product_id) {
                const productTotal = parseFloat(order.total || 0);
                
                ordersMap[order.id].products[order.product_id] = {
                    final_total: parseFloat(order.final_total || order.total || 0),
                    id: order.product_id,
                    product: {
                        category: order.category,
                        content: order.content,
                        description: order.description,
                        id: order.product_id,
                        imageUrl: order.imageUrl,
                        imagesUrl: ["", "", "", "", ""], // 預設空陣列
                        is_enabled: order.is_enabled ? 1 : 0,
                        num: order.num || 10,
                        origin_price: parseFloat(order.origin_price || 0),
                        price: parseFloat(order.price || 0),
                        title: order.title,
                        unit: order.unit
                    },
                    qty: parseInt(order.qty || 0),
                    total: productTotal
                };
                
                // 累加總金額
                ordersMap[order.id].total += productTotal;
            }
        });

        // 按照原始順序轉換為陣列格式
        const ordersArray = distinctOrders.map(order => ordersMap[order.id]).filter(Boolean);

        const response = {
            success: true,
            orders: ordersArray,
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
    } catch (error) {
        console.error("取得後台訂單錯誤:", error);
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

    try {
        // 獲取購物車資料
        const [cartItems] = await db.query(`
            SELECT 
                c.id as cart_id,
                c.product_id,
                c.qty,
                c.total,
                p.category,
                p.content,
                p.description,
                p.id as product_original_id,
                p.imageUrl,
                p.is_enabled,
                p.origin_price,
                p.price,
                p.title,
                p.unit,
                p.num
            FROM carts c 
            LEFT JOIN products p ON c.product_id = p.id
        `);

        if (cartItems.length === 0) {
            return res.status(400).json({ success: false, message: "購物車為空" });
        }

        // 計算總金額
        const total = cartItems.reduce((sum, cartItem) => {
            const itemTotal = Number(cartItem.total);
            if (isNaN(itemTotal)) {
                console.error("Invalid total for cart item:", cartItem);
                return sum;
            }
            return sum + itemTotal;
        }, 0);

        // 檢查 total 是否有效
        if (isNaN(total)) {
            return res.status(400).json({ success: false, message: "計算總金額時發生錯誤" });
        }

        // 先新增或取得用戶
        let userId;
        const [[existingUser]] = await db.query(
            'SELECT id FROM users WHERE email = ?', 
            [user.email]
        );

        if (existingUser) {
            userId = existingUser.id;
            // 更新用戶資訊
            await db.query(
                'UPDATE users SET name = ?, tel = ?, address = ? WHERE id = ?',
                [user.name, user.tel, user.address, userId]
            );
        } else {
            // 新增用戶
            const [userResult] = await db.query(
                'INSERT INTO users (name, email, tel, address) VALUES (?, ?, ?, ?)',
                [user.name, user.email, user.tel, user.address]
            );
            userId = userResult.insertId;
        }

        // 生成唯一的訂單 ID（作為訂單群組識別）
        const baseOrderId = 'order_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const createAt = Date.now();

        // 為每個購物車項目創建訂單記錄，每筆記錄使用不同的 ID
        const orderPromises = cartItems.map((cartItem, index) => {
            // 為每個產品創建唯一的記錄 ID
            const recordId = `${baseOrderId}_${index}`;
            return db.query(
                'INSERT INTO orders (id, user_id, product_id, qty, total, final_total, is_paid, create_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    recordId, // 使用唯一的記錄 ID
                    userId,
                    cartItem.product_id,
                    cartItem.qty,
                    cartItem.total,
                    cartItem.total,
                    false,
                    createAt
                ]
            );
        });

        // 執行所有訂單插入操作
        await Promise.all(orderPromises);

        // 清空購物車
        await db.query('DELETE FROM carts');

        res.status(201).json({
            success: true,
            message: "已建立訂單",
            total: total,
            orderId: baseOrderId, // 回傳基礎訂單 ID
            create_at: createAt
        });

    } catch (error) {
        console.error("Error creating order:", error);
        res.status(500).json({ success: false, message: "無法建立訂單" });
    }
});

// 取得單一筆訂單
router.get('/order/:orderId', async (req, res) => {
    const { orderId } = req.params;

    try {
        // 從 MySQL 資料庫中檢索指定的訂單（可能有多筆記錄，因為一個訂單可能有多個產品）
        const [orders] = await db.query(`
            SELECT 
                o.id,
                o.user_id,
                o.product_id,
                o.qty,
                o.total,
                o.final_total,
                o.is_paid,
                o.create_at,
                u.name as user_name,
                u.email as user_email,
                u.tel as user_tel,
                u.address as user_address,
                p.id as product_original_id,
                p.category,
                p.content,
                p.description,
                p.title,
                p.unit,
                p.imageUrl,
                p.origin_price,
                p.price,
                p.is_enabled,
                p.num
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN products p ON o.product_id = p.id
            WHERE o.id LIKE ?
            ORDER BY o.id
        `, [`${orderId}%`]); // 使用 LIKE 來匹配基礎訂單ID

        // 如果訂單不存在
        if (orders.length === 0) {
            return res.status(404).json({
                success: false,
                message: "訂單不存在"
            });
        }

        // 組織訂單資料
        const orderInfo = {
            id: orderId,
            create_at: orders[0].create_at,
            is_paid: Boolean(orders[0].is_paid),
            total: 0,
            user: {
                name: orders[0].user_name,
                email: orders[0].user_email,
                tel: orders[0].user_tel,
                address: orders[0].user_address
            },
            products: {}
        };

        // 處理產品資料
        orders.forEach(order => {
            if (order.product_id) {
                const productTotal = parseFloat(order.total || 0);
                
                orderInfo.products[order.product_id] = {
                    final_total: parseFloat(order.final_total || order.total || 0),
                    id: order.product_id,
                    product: {
                        category: order.category,
                        content: order.content,
                        description: order.description,
                        id: order.product_id,
                        imageUrl: order.imageUrl,
                        imagesUrl: ["", "", "", "", ""], // 預設空陣列
                        is_enabled: order.is_enabled ? 1 : 0,
                        num: order.num || 10,
                        origin_price: parseFloat(order.origin_price || 0),
                        price: parseFloat(order.price || 0),
                        title: order.title,
                        unit: order.unit
                    },
                    qty: parseInt(order.qty || 0),
                    total: productTotal
                };
                
                // 累加總金額
                orderInfo.total += productTotal;
            }
        });

        // 構造響應數據結構
        const response = {
            success: true,
            order: orderInfo
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