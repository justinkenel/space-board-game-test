const path = require('path');
const webpack = require('webpack');
const plugins=[];

module.exports = {
  context: path.join(__dirname, './web-client'),
  entry: './main.js',
  devtool: "source-map",
  output: {
    path: path.join(__dirname, './dist'),
    filename: 'bundle.js',
    library:'BoardGameTest',
    libraryTarget:'umd'
  },
  module: {
    loaders: [
      { test: /\.js$/, loader: 'babel-loader', exclude: /node_modules/ }
    ]
  },
  plugins: plugins
}
