cd src/contracts/
aztec-nargo compile
echo "done compile"
aztec codegen -o src/artifacts target
echo "done codegen"
cd ../../
./deployment_command.sh | python3 generate_config.py
