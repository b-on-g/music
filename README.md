# bog

Реестр паков организации [b-on-g](https://github.com/b-on-g).

Сам код здесь не лежит: каждый модуль — отдельный репозиторий, перечисленный
в `bog.meta.tree`. MAM разворачивает их в подпапки при сборке.

## Как подключить

```bash
git clone https://github.com/hyoo-ru/mam.git
cd mam
npm install
npx mam bog/<module>
```

## Лицензия

MIT, см. [LICENSE](./LICENSE).
