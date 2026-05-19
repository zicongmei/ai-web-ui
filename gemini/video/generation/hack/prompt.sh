MODEL="gemini-3.1-pro-preview"
# MODEL="gemini-3.5-flash"
# MODEL="gemini-3-pro-preview"
# MODEL="gemini-2.5-flash"

pushd /usr/local/google/home/zicong/code/src/github.com/zicongmei/ai-coder/v2
go run  coder.go  \
    --file-list /usr/local/google/home/zicong/code/src/github.com/zicongmei/ai-web-ui/gemini/video/generation/hack/files.txt \
    --model ${MODEL}  \
    --inplace  \
    --prompt '
Error: Invalid JSON payload received. Unknown name "text_prompt": Cannot find field.

also add a debug button to show the all api request and response payloads
'
popd
