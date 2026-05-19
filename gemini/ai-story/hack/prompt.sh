MODEL="gemini-3.1-pro-preview"
# MODEL="gemini-3.5-flash"
# MODEL="gemini-3-pro-preview"
MODEL="gemini-2.5-flash"
pushd /usr/local/google/home/zicong/code/src/github.com/zicongmei/ai-coder/v2
go run  coder.go  \
    --file-list /usr/local/google/home/zicong/code/src/github.com/zicongmei/ai-story/hack/files \
    --model "${MODEL}"  \
    --inplace  \
    --v=1 \
    --prompt '
after the generation of the chapter, also count and display the number of characters

'
popd

