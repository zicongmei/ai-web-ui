MODEL="gemini-3.1-pro-preview"
# MODEL="gemini-3.5-flash"
# MODEL="gemini-3-pro-preview"
# MODEL="gemini-2.5-flash"

pushd /usr/local/google/home/zicong/code/src/github.com/zicongmei/ai-coder/v2
go run  coder.go  \
    --file-list /usr/local/google/home/zicong/code/src/github.com/zicongmei/ai-web-ui/gemini/video/analyzer/hack/files.txt \
    --model ${MODEL}  \
    --inplace  \
    --prompt '
update the gemini 2.5 and 3.0 model names to availanble video analyzer models.

refer to the API referemce in https://ai.google.dev/gemini-api/docs/models

'
popd
