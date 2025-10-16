const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const session = require('express-session')
//路由相關
const indexRouter = require('./routes/index');
const useMysqlRouter = require('./routes/useMysql');
const bodyParser = require('body-parser');
const flash = require('connect-flash');

const app = express();

// 跨域
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  // 允許使用的標頭，包括 Authorization
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  // 允許的 HTTP 方法
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});


//套件相關
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true,
}))
app.use(flash());
app.use(cookieParser());


app.use('/', indexRouter);
app.use('/useMysql', useMysqlRouter);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.engine('ejs',require('express-ejs-extend'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(express.static(path.join(__dirname, 'public')));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
