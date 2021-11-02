module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          node: 6,
          browsers: ['> 0.5%', 'last 2 versions'],
        },
      },
    ],
  ],
  plugins: [
    [
      '@babel/transform-runtime',
      {
        helpers: false,
        regenerator: true,
      },
    ],
  ],
}
